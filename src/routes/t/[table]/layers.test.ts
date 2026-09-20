/**
 * The layer builder, driven by one fixed set of VERSION 4 answers.
 *
 * Every expected string below is typed out verbatim rather than read back
 * from `questions.ts`, so a fragment that silently changes fails here
 * instead of agreeing with itself. The one exception is the future's
 * `moodLine` (a 70-word paragraph) — that clause is referenced, and what is
 * asserted about it is its POSITION and the era clause appended after it.
 */
import { describe, it, expect } from 'vitest';
import { FUTURES } from '$lib/game/futures';
import { QUESTIONS } from '$lib/game/questions';
import { ZONE_SETS } from '$lib/game/zones';
import { NO_TEXT, houseBase } from '$lib/server/prompt';
import {
	FEEL_IDS,
	MATERIAL_IDS,
	ZONE_OWNED_IDS,
	buildLayerInputs,
	composeBase,
	composeZonePrompt,
	resolveZone,
	type AnswerLike
} from './layers';

const ABUNDANT = FUTURES.find((f) => f.key === 'solarpunk')!;
const GARDEN = FUTURES.find((f) => f.key === 'garden-city')!;
const ERA_2040 = 'set in a hyper-futuristic 2040, technology fully integrated and visible throughout the architecture';
const LENS_ABUNDANT = `seen through the lens of ${ABUNDANT.name}: ${ABUNDANT.moodLine.replace(/\.$/, '')}`;

const ANSWERS: AnswerLike[] = [
	{ questionId: 'q1', keys: ['hyperfuturistic-2040'] },
	{ questionId: 'q2', keys: ['raw-elemental'], pushReply: 'raw concrete and brushed steel' },
	{ questionId: 'q2:and', keys: ['human'] },
	{ questionId: 'q3', keys: ['expected-you'] },
	{ questionId: 'q3:and', keys: ['on-the-journey'] },
	{ questionId: 'q4w', keys: ['deep-desk'] },
	{ questionId: 'q4w:and', keys: ['your-settings'] },
	{ questionId: 'q5c', keys: ['judgement-room'], pushReply: 'who gets fired' },
	{ questionId: 'q5c:and', keys: ['in-the-light'] },
	{ questionId: 'q6r', keys: ['old-forest'] },
	{ questionId: 'q6r:and', keys: ['fully-immersive'] },
	{ questionId: 'q7', keys: ['surfaces-wake-up'] },
	{ questionId: 'q8', keys: ['deliberate-pockets'] },
	{ questionId: 'q10', keys: ['knows-when-to-step-back'] },
	{ questionId: 'q10:and', keys: ['a'] },
	{ questionId: 'q11', keys: ['calm', 'focused', 'alive'] },
	{ questionId: 'wildcard', keys: ['wildcard-open'], text: { 'wildcard-open': 'a room with a working fireplace' } }
];

const built = buildLayerInputs({ futureKey: 'solarpunk', era: 'hyperfuturistic-2040', answers: ANSWERS });

describe('buildLayerInputs', () => {
	it('opens mood with the house base, then the lens line, then appends the era only because the chip was nudged', () => {
		expect(built.mood).toBe(`${houseBase('2040')}. ${LENS_ABUNDANT}. ${ERA_2040}`);
	});

	it('orders the house base ahead of the lens line even with no era nudge', () => {
		const onDefault = buildLayerInputs({
			futureKey: 'solarpunk',
			era: 'recognisably-2035',
			answers: [{ questionId: 'q1', keys: ['recognisably-2035'] }]
		});
		expect(onDefault.mood).toBe(`${houseBase('2035')}. ${LENS_ABUNDANT}`);
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

	it('builds materialsAndLight from q2, its scale pick, its push reply, then q7 and q8', () => {
		expect(built.materialsAndLight).toBe(
			'raw and elemental material world: grey, sand and ochre tones, board-marked concrete, stone and rough timber, rugged unpolished finishes. ' +
				'human scale: ceilings and rooms sized to a person, close and comfortable. ' +
				'raw concrete and brushed steel. ' +
				'walls, glass and tables blank until needed, one surface awake as a display while the rest stay plain. ' +
				'deliberate placed pockets of planting at a few chosen moments'
		);
	});

	it('keeps q2s push reply and scale pick out of the layer when the table gave neither', () => {
		const quiet = buildLayerInputs({
			futureKey: 'solarpunk',
			answers: [{ questionId: 'q2', keys: ['raw-elemental'] }]
		});
		expect(quiet.materialsAndLight).toBe(
			'raw and elemental material world: grey, sand and ochre tones, board-marked concrete, stone and rough timber, rugged unpolished finishes'
		);
	});

	it('does not pull the zone-worthy questions into the top-level materialsAndLight layer', () => {
		expect(built.materialsAndLight).not.toContain('deep desk');
		expect(built.materialsAndLight).not.toContain('judgement room');
		expect(built.materialsAndLight).not.toContain('old-forest');
		expect(built.materialsAndLight).not.toContain('expected the visitor');
	});

	/**
	 * THE PER-ZONE CAP. The base is prepended to all four zone prompts, so a
	 * fragment here is said four times per table on top of the zone suffix
	 * that already owns it. With the `book` zone set every programme
	 * question (q3, q4w, q5c, q6r) belongs to a zone, so what survives at
	 * the table level is the table's own sentence — q5c's push reply — and
	 * nothing else.
	 */
	it('caps the base programme to what no zone owns — here just q5cs push reply', () => {
		expect(built.programme).toBe('who gets fired');
	});

	it('does not repeat a zone-owned fragment or its And pick at the table level', () => {
		for (const fragment of [
			'an arrival hall that expected the visitor',
			'a route that lights ahead of the visitor',
			'a deep desk over a metre deep',
			'a small judgement room',
			'an old-forest recovery space'
		]) {
			expect(built.programme).not.toContain(fragment);
		}
	});

	it('the zone suffix still carries that zones own question and its And pick, exactly once', () => {
		const plaza = ZONE_SETS.book.find((z) => z.key === 'plaza')!;
		const prompt = composeZonePrompt('BASE', resolveZone(plaza, ANSWERS), built.negative);
		expect(prompt).toContain('an arrival hall that expected the visitor');
		expect(prompt).toContain('a route that lights ahead of the visitor');
		expect(prompt.split('an arrival hall that expected the visitor')).toHaveLength(2);
		// and not another zone's questions
		expect(prompt).not.toContain('a deep desk over a metre deep');
	});

	it('builds feel from q10s strength, its hardest pick, then q11s three picks in option order', () => {
		expect(built.feel).toBe(
			'brilliant at knowing when to step back: places kept deliberately free of AI, less efficient on purpose, ' +
				'the hardest trade-off was protecting attention, calm, focused, alive'
		);
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

	it('ignores an And pick whose parent question was never answered, without a placeholder', () => {
		const orphanAnd = buildLayerInputs({ futureKey: 'solarpunk', answers: [{ questionId: 'q2:and', keys: ['cathedral'] }] });
		expect(orphanAnd.materialsAndLight).toBe('cathedral scale: soaring ceilings many storeys high, the room dwarfing the people in it');
		expect(composeBase(orphanAnd)).not.toContain('{');
	});
});

describe('every V4 question reaches a layer or a zone', () => {
	it('is owned by a zone, or feeds materials, or feeds feel — never orphaned', () => {
		for (const q of QUESTIONS) {
			const reached =
				ZONE_OWNED_IDS.has(q.id) ||
				(MATERIAL_IDS as readonly string[]).includes(q.id) ||
				(FEEL_IDS as readonly string[]).includes(q.id);
			expect(reached, `${q.id} reaches nothing`).toBe(true);
		}
	});

	it('routes each V4 question where the brief says', () => {
		const owners = (id: string) => ZONE_SETS.book.filter((z) => z.questionIds.includes(id)).map((z) => z.key);
		expect(owners('q4w').sort()).toEqual(['library', 'studio']); // workstation -> studio/library
		expect(owners('q5c')).toEqual(['library']); // centaur deep work -> library
		expect(owners('q6r')).toEqual(['garden']); // recharge biome -> garden
		expect(owners('q3')).toEqual(['plaza']); // arrival -> plaza
		expect(MATERIAL_IDS).toContain('q8'); // nature -> all zones (via the base)
		expect(MATERIAL_IDS).toContain('q7'); // technology -> all zones (via the base)
		expect(FEEL_IDS).toContain('q10'); // brilliant-at-one -> feel
		for (const id of ['q7', 'q8', 'q10', 'q11']) expect(ZONE_OWNED_IDS.has(id)).toBe(false);
	});
});

describe('composeBase / composeZonePrompt', () => {
	it('composes a full example for a garden-city table on its default era — base, then lens, nothing else answered', () => {
		const gc = buildLayerInputs({ futureKey: 'garden-city', answers: [] });
		const composed = composeBase(gc);
		expect(composed).toBe(
			`${houseBase('2035')}. seen through the lens of ${GARDEN.name}: ${GARDEN.moodLine.replace(/\.$/, '')}`
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

	it('resolves the library zones {q5c}/{q4w} placeholders, each with its And pick, from the answers', () => {
		const library = ZONE_SETS.book.find((z) => z.key === 'library')!;
		const resolved = resolveZone(library, ANSWERS);
		expect(resolved.renderSuffix).not.toContain('{q5c}');
		expect(resolved.renderSuffix).not.toContain('{q4w}');
		expect(resolved.renderSuffix).toContain('a small judgement room for a hard call');
		expect(resolved.renderSuffix).toContain("the AI present as light, the room's colour and brightness carrying its signals");
		expect(resolved.renderSuffix).toContain('a deep desk over a metre deep');
		expect(resolved.renderSuffix).toContain('a workstation that has already set its height');
	});

	it('resolves the garden zones recharge biome with its immersion depth', () => {
		const garden = ZONE_SETS.book.find((z) => z.key === 'garden')!;
		const resolved = resolveZone(garden, ANSWERS);
		expect(resolved.renderSuffix).toContain(
			'an old-forest recovery space: tall trunks, filtered light, long quiet views, no one talking, a place to think slowly alone, a fully immersive interior, floor to ceiling, sound and climate included'
		);
	});

	it('falls back to "as the table left it" for an unanswered zone question', () => {
		const library = ZONE_SETS.book.find((z) => z.key === 'library')!;
		const resolved = resolveZone(library, []);
		expect(resolved.renderSuffix).toContain('as the table left it');
		expect(resolved.renderSuffix).not.toContain('{');
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
