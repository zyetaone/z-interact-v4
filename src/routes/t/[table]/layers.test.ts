/**
 * The layer builder, driven by one fixed set of VERSION 3 answers.
 *
 * Every expected string below is typed out verbatim rather than read back
 * from `questions.ts`, so a fragment that silently changes fails here
 * instead of agreeing with itself. The one exception is the future's
 * `moodLine` (a 70-word paragraph) — that clause is referenced, and what is
 * asserted about it is its POSITION and the era clause appended after it.
 */
import { describe, it, expect } from 'vitest';
import { FUTURES } from '$lib/game/futures';
import { ZONE_SETS } from '$lib/game/zones';
import { NO_TEXT, houseBase } from '$lib/server/prompt';
import { buildLayerInputs, composeBase, composeZonePrompt, resolveZone, type AnswerLike } from './layers';

const SOLARPUNK = FUTURES.find((f) => f.key === 'solarpunk')!;
const GARDEN = FUTURES.find((f) => f.key === 'garden-city')!;
const ERA_2040 =
	'set in a hyper-futuristic 2040, technology fully integrated and visible throughout the architecture';
const LENS_SOLARPUNK = `seen through the lens of ${SOLARPUNK.name}: ${SOLARPUNK.moodLine.replace(/\.$/, '')}`;

const ANSWERS: AnswerLike[] = [
	{ questionId: 'q1', keys: ['hyperfuturistic-2040'] },
	{ questionId: 'q2', keys: ['raw-elemental'], pushReply: 'raw concrete and brushed steel' },
	{ questionId: 'q3', keys: ['human-or-ai-order'], text: { 'human-or-ai-order': 'human first, then the AI' } },
	{
		questionId: 'q4',
		keys: ['sub-35db-acoustic', 'what-its-made-of'],
		text: { 'what-its-made-of': 'rammed earth and glass' }
	},
	{ questionId: 'q5', keys: ['nap-walk-water-dark'] },
	{
		questionId: 'q6',
		keys: ['rooms-change-size', 'disappeared-by-2035'],
		text: { 'disappeared-by-2035': 'the assigned desk' }
	},
	{ questionId: 'q7', keys: ['analogue-zones', 'senses-and-adjusts'] },
	{ questionId: 'q8', keys: ['deliberate-pockets'] },
	{
		questionId: 'q9',
		keys: ['deciding-together', 'refused-to-automate'],
		text: { 'refused-to-automate': 'who gets fired' }
	},
	{ questionId: 'q10', keys: ['knows-when-to-step-back'], pushReply: 'the acoustic core' },
	{ questionId: 'q11', keys: ['calm', 'focused', 'alive'] },
	{ questionId: 'wildcard', keys: ['wildcard-open'], text: { 'wildcard-open': 'a room with a working fireplace' } }
];

const built = buildLayerInputs({ futureKey: 'solarpunk', era: 'hyperfuturistic-2040', answers: ANSWERS });

describe('buildLayerInputs', () => {
	it('opens mood with the house base, then the lens line, then appends the era only because the chip was nudged', () => {
		expect(built.mood).toBe(`${houseBase('2040')}. ${LENS_SOLARPUNK}. ${ERA_2040}`);
	});

	it('orders the house base ahead of the lens line even with no era nudge', () => {
		const onDefault = buildLayerInputs({
			futureKey: 'solarpunk',
			era: 'recognisably-2035',
			answers: [{ questionId: 'q1', keys: ['recognisably-2035'] }]
		});
		expect(onDefault.mood).toBe(`${houseBase('2035')}. ${LENS_SOLARPUNK}`);
	});

	it('reads the house base year off the era chip, not a hardcoded 2035', () => {
		expect(built.mood.startsWith(houseBase('2040'))).toBe(true);
		expect(built.mood).not.toContain(houseBase('2035'));
	});

	it('falls back to the house register when the table skipped the future card', () => {
		const skipped = buildLayerInputs({ futureKey: null, answers: [] });
		expect(skipped.mood).toContain('moody rather than stark');
	});

	it('appends the era fragment from era.ts when the chip is nudged back to 2026', () => {
		const nudged = buildLayerInputs({
			futureKey: 'garden-city',
			era: 'same-as-2026',
			answers: [{ questionId: 'q1', keys: ['same-as-2026'] }]
		});
		expect(nudged.mood).toBe(
			`${houseBase('2026')}. seen through the lens of ${GARDEN.name}: ${GARDEN.moodLine.replace(/\.$/, '')}. the same familiar 2026 shell, deliberately unchanged at a glance, while newer intelligence works quietly out of sight`
		);
	});

	it('builds materialsAndLight from q2 plus its push reply, then q7s material-adjacent fragments', () => {
		expect(built.materialsAndLight).toBe(
			'raw and elemental material world: exposed concrete, quarried stone, unfinished timber, deliberate surface texture. ' +
				'raw concrete and brushed steel. ' +
				'a space that senses noise, air, occupancy and mood in real time, and adjusts before it is asked to — visibly mid-adjustment. ' +
				'deliberately analogue zones with no technology at all, paper, pen and unpowered furniture'
		);
	});

	it('keeps q2s push reply out of the layer when the table typed nothing', () => {
		const quiet = buildLayerInputs({
			futureKey: 'solarpunk',
			answers: [{ questionId: 'q2', keys: ['raw-elemental'] }]
		});
		expect(quiet.materialsAndLight).toBe(
			'raw and elemental material world: exposed concrete, quarried stone, unfinished timber, deliberate surface texture'
		);
	});

	it('does not pull q4, q5 or q8 into the top-level materialsAndLight layer (they feed zones instead)', () => {
		expect(built.materialsAndLight).not.toContain('acoustic core');
		expect(built.materialsAndLight).not.toContain('nap');
		expect(built.materialsAndLight).not.toContain('greenery');
	});

	/**
	 * THE PER-ZONE CAP. The base is prepended to all four zone prompts, so a
	 * fragment here is said four times per table on top of the zone suffix
	 * that already owns it. The fidelity run's presentation boards came from
	 * exactly that enumeration. With the `book` zone set every programme
	 * question (q3, q6, q9, q10) belongs to a zone, so what survives at the
	 * table level is the table's own sentence — q10's push reply — and
	 * nothing else.
	 */
	it('caps the base programme to what no zone owns — here just q10s push reply', () => {
		expect(built.programme).toBe('the acoustic core');
	});

	it('does not repeat a zone-owned fragment at the table level', () => {
		for (const fragment of [
			'an arrival that blends a human welcome',
			'rooms with movable walls',
			'the centaur room where humans and AI work as one unit',
			"this workplace's agility"
		]) {
			expect(built.programme).not.toContain(fragment);
		}
	});

	it('the zone suffix still carries that zones own questions, exactly once', () => {
		const plaza = ZONE_SETS.book.find((z) => z.key === 'plaza')!;
		const prompt = composeZonePrompt('BASE', resolveZone(plaza, ANSWERS), built.negative);
		// plaza owns q3 (arrival) and q10 (agility)
		expect(prompt).toContain('an arrival that blends a human welcome');
		expect(prompt).toContain('an agile workplace that recedes when it is not needed');
		expect(prompt.split('an arrival that blends a human welcome')).toHaveLength(2);
		// and not another zone's questions
		expect(prompt).not.toContain('rooms with movable walls');
	});

	it('builds feel from q11s three picks, in option order', () => {
		expect(built.feel).toBe('calm, focused, alive');
	});

	it('carries the wildcard verbatim inside its own fragment', () => {
		expect(built.wildcard).toBe('one additional idea the table volunteered, unprompted: a room with a working fireplace');
	});

	it('omits the wildcard entirely when nothing was typed', () => {
		expect(buildLayerInputs({ futureKey: 'solarpunk', answers: [] }).wildcard).toBeUndefined();
	});

	it('puts the layout guard first, then the house terms, then the futures own, without duplicates', () => {
		expect(built.negative).toBe(
			'collage, grid, panels, storyboard, split screen, mosaic, contact sheet, multiple views, text, labels, ' +
				'no personas, stark white, posed faces, watermark, neon signage, dead plants, sterile, grey, concrete, glare'
		);
	});

	/**
	 * The fidelity run produced presentation BOARDS — a hero view plus a grid
	 * of small panels — rather than one room. This term is the direct answer
	 * to that, so it is asserted by name rather than only through the string
	 * above, which someone could reorder without noticing the loss.
	 */
	it('names collage in the negative', () => {
		expect(built.negative).toContain('collage');
		expect(built.negative).toContain('split screen');
	});

	it('drops an open options {text} slot rather than rendering the placeholder', () => {
		const untyped = buildLayerInputs({ futureKey: 'solarpunk', answers: [{ questionId: 'q3', keys: ['human-or-ai-order'] }] });
		expect(untyped.programme).not.toContain('{text}');
		// q3 belongs to the plaza zone, so the table-level programme is empty;
		// the fragment itself is asserted through the zone suffix instead.
		expect(untyped.programme).toBe('');
		const plaza = ZONE_SETS.book.find((z) => z.key === 'plaza')!;
		expect(resolveZone(plaza, [{ questionId: 'q3', keys: ['human-or-ai-order'] }]).renderSuffix).toContain(
			'an arrival that blends a human welcome and an AI one, ordered as the table specifies'
		);
	});
});

describe('composeBase / composeZonePrompt', () => {
	it('composes a full example for a Garden City table on its default era — base, then lens, nothing else answered', () => {
		const GARDEN_CITY = FUTURES.find((f) => f.key === 'garden-city')!;
		const gc = buildLayerInputs({ futureKey: 'garden-city', answers: [] });
		const composed = composeBase(gc);
		expect(composed).toBe(
			`${houseBase('2035')}. seen through the lens of ${GARDEN_CITY.name}: ${GARDEN_CITY.moodLine.replace(/\.$/, '')}`
		);
	});

	it('orders the base mood, materials, programme, feel, wildcard and adds no guards', () => {
		const base = composeBase(built);
		expect(base.indexOf(built.materialsAndLight)).toBeGreaterThan(base.indexOf(built.mood));
		expect(base.indexOf(built.programme)).toBeGreaterThan(base.indexOf(built.materialsAndLight));
		expect(base.indexOf(built.feel)).toBeGreaterThan(base.indexOf(built.programme));
		expect(base.endsWith(built.wildcard!)).toBe(true);
		expect(base).not.toContain(NO_TEXT);
	});

	it('resolves the library zones {q4}/{q5} placeholders from the answers', () => {
		const library = ZONE_SETS.book.find((z) => z.key === 'library')!;
		const resolved = resolveZone(library, ANSWERS);
		expect(resolved.renderSuffix).not.toContain('{q4}');
		expect(resolved.renderSuffix).not.toContain('{q5}');
		expect(resolved.renderSuffix).toContain('an acoustic core rated below 35 decibels');
		expect(resolved.renderSuffix).toContain('rammed earth and glass');
		expect(resolved.renderSuffix).toContain('restoration through the plainest tools');
	});

	it('falls back to "as the table left it" for an unanswered zone question', () => {
		const library = ZONE_SETS.book.find((z) => z.key === 'library')!;
		const resolved = resolveZone(library, []);
		expect(resolved.renderSuffix).toContain('as the table left it');
	});

	it('wraps the base in NO_TEXT at both ends with the zone suffix in between', () => {
		const library = ZONE_SETS.book.find((z) => z.key === 'library')!;
		const zone = resolveZone(library, ANSWERS);
		const full = composeZonePrompt('EDITED BY THE TABLE', zone);
		expect(full.startsWith(NO_TEXT)).toBe(true);
		expect(full.endsWith(NO_TEXT)).toBe(true);
		expect(full).toContain('EDITED BY THE TABLE');
		expect(full.indexOf(zone.renderSuffix)).toBeGreaterThan(full.indexOf('EDITED BY THE TABLE'));
	});
});
