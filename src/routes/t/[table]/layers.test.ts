/**
 * The layer builder, driven by one fixed set of answers.
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
const PRAGMATIST = FUTURES.find((f) => f.key === 'pragmatist-retrofit')!;
const ERA_2040 =
	'set in a hyper-futuristic 2040, technology fully integrated and visible throughout the architecture';
const LENS_SOLARPUNK = `seen through the lens of ${SOLARPUNK.name}: ${SOLARPUNK.moodLine.replace(/\.$/, '')}`;

const ANSWERS: AnswerLike[] = [
	{ questionId: 'q1', keys: ['hyperfuturistic-2040'] },
	{ questionId: 'q2', keys: ['raw-elemental'], pushReply: 'raw concrete and brushed steel' },
	{ questionId: 'q3', keys: ['both-in-order'], text: { 'both-in-order': 'human first, then the AI' } },
	{ questionId: 'q4', keys: ['light-paths'] },
	{ questionId: 'q5', keys: ['null-zones'], pushReply: 'a null zone for thinking, the garden for after' },
	{
		questionId: 'q6',
		keys: ['rooms-change-size', 'disappeared-by-2035'],
		text: { 'disappeared-by-2035': 'the assigned desk' }
	},
	{ questionId: 'q7', keys: ['analogue-zones'] },
	{ questionId: 'q8', keys: ['deliberate-pockets'] },
	{ questionId: 'q9', keys: ['adjusts-before-you-ask'], pushReply: 'the lights warm as you sit down' },
	{ questionId: 'q10', keys: ['robots-visible-or-hidden'] },
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

	it('appends Q1s push reply verbatim when the era landed on 2026, after the house base and lens', () => {
		const protecting = buildLayerInputs({
			futureKey: 'pragmatist-retrofit',
			era: 'same-as-2026',
			answers: [{ questionId: 'q1', keys: ['same-as-2026'], pushReply: 'the window seat everyone fights over' }]
		});
		expect(protecting.mood).toBe(
			`${houseBase('2026')}. seen through the lens of ${PRAGMATIST.name}: ${PRAGMATIST.moodLine.replace(/\.$/, '')}. the window seat everyone fights over`
		);
	});

	it('builds materialsAndLight from q2, q5 and q8 plus q5s push reply', () => {
		expect(built.materialsAndLight).toBe(
			'raw and elemental material world: exposed concrete, quarried stone, unfinished timber, deliberate surface texture. ' +
				'a null zone with no signal at all — deliberately unconnected, unmarked, a room the network does not reach. ' +
				'deliberate, curated pockets of greenery placed at specific pause points, not everywhere. ' +
				'a null zone for thinking, the garden for after'
		);
	});

	it('builds programme from q3, q4, q6, q7, q9, q10 plus q9s push reply, splicing open options', () => {
		expect(built.programme).toBe(
			'a layered arrival combining AI guidance and a human welcome, in an order the table specifies: human first, then the AI. ' +
				'movement guided by illuminated light paths embedded in the floor, tracing the route ahead. ' +
				'rooms with movable walls that visibly change size to fit the group inside them. ' +
				'a workplace with one conspicuous absence, specified by the table: the assigned desk, deliberately missing. ' +
				'deliberately analogue zones with no technology at all, paper, pen and unpowered furniture. ' +
				'a building adjusting climate, sound or layout a moment before it is asked to, visibly mid-adjustment. ' +
				'service robots present, either visibly moving through the space or working out of sight. ' +
				'the lights warm as you sit down'
		);
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

	it('puts the house negative terms ahead of the futures own, without duplicates', () => {
		expect(built.negative).toBe(
			'no personas, stark white, posed faces, text, watermark, neon signage, dead plants, sterile, grey, concrete, glare'
		);
	});

	it('drops an open options {text} slot rather than rendering the placeholder', () => {
		const untyped = buildLayerInputs({ futureKey: 'solarpunk', answers: [{ questionId: 'q3', keys: ['both-in-order'] }] });
		expect(untyped.programme).not.toContain('{text}');
		expect(untyped.programme).toBe('a layered arrival combining AI guidance and a human welcome, in an order the table specifies');
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

	it('resolves a zones {qN} placeholders from the answers', () => {
		const library = ZONE_SETS.book.find((z) => z.key === 'library')!;
		const resolved = resolveZone(library, ANSWERS);
		expect(resolved.renderSuffix).not.toContain('{q5}');
		expect(resolved.renderSuffix).toContain('a null zone with no signal at all');
		expect(resolved.renderSuffix).toContain('deliberately analogue zones');
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
