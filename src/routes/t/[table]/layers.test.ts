/**
 * The layer builder, driven by one fixed set of VERSION 4 answers, composed
 * per prompt-recipe.md's five moves.
 *
 * Every expected string below is typed out verbatim rather than read back
 * from `questions.ts`, so a fragment that silently changes fails here
 * instead of agreeing with itself. The one exception is the future's
 * `worldOutside` — that clause is referenced, and what is asserted about it
 * is its POSITION, right after the frame.
 */
import { describe, it, expect } from 'vitest';
import { FUTURES } from '$lib/game/futures';
import { QUESTIONS } from '$lib/game/questions';
import { ZONE_SETS } from '$lib/game/zones';
import { NO_TEXT, houseBase } from '$lib/server/prompt';
import {
	FEEL_IDS,
	MATERIAL_IDS,
	WALL_ONLY_IDS,
	ZONE_OWNED_IDS,
	buildLayerInputs,
	composeBase,
	composeZonePrompt,
	resolveZone,
	wordCount,
	type AnswerLike
} from './layers';

const ABUNDANT = FUTURES.find((f) => f.key === 'solarpunk')!;
const GARDEN = FUTURES.find((f) => f.key === 'garden-city')!;
const FRAME_2040 = 'A film still, a 2040 workplace: anamorphic 35 mm, shallow focus, volumetric light, no logos';

/** A fully answered table: every question, every And, both push replies, the wildcard, a nudged era. */
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
	it('opens mood with the cinematic frame in the chips year, then the world through the window, then the lenss one indoor 2040 cue', () => {
		expect(built.mood).toBe(`${FRAME_2040}. ${ABUNDANT.worldOutside}. ${ABUNDANT.insideCue}`);
		expect(houseBase('2040')).toBe(FRAME_2040);
	});

	it('gives every lens an indoor cue of twelve words or fewer, so the room reads as 2040 with the window out of frame', () => {
		for (const f of FUTURES) {
			expect(f.insideCue, f.key).toMatch(/^inside, /);
			expect(wordCount(f.insideCue), f.key).toBeLessThanOrEqual(12);
		}
	});

	it('is a film still, not archviz: no "architectural visualisation", no "no people in focus"', () => {
		expect(built.mood).not.toMatch(/architectural visualisation|no people in focus|establishing/);
		expect(built.mood).toMatch(/anamorphic 35 mm/);
	});

	it('never prints the futures name — the lens is the window only', () => {
		for (const f of FUTURES) expect(built.mood).not.toContain(f.name);
		expect(built.mood).not.toContain(ABUNDANT.moodLine);
	});

	it('reads the frames year off the era chip, so a nudge shows up there and nowhere else', () => {
		const onDefault = buildLayerInputs({ futureKey: 'solarpunk', era: 'recognisably-2035', answers: [] });
		expect(onDefault.mood).toBe(`${houseBase('2035')}. ${ABUNDANT.worldOutside}. ${ABUNDANT.insideCue}`);
		const back = buildLayerInputs({ futureKey: 'garden-city', era: 'same-as-2026', answers: [{ questionId: 'q1', keys: ['same-as-2026'] }] });
		expect(back.mood).toBe(`${houseBase('2026')}. ${GARDEN.worldOutside}. ${GARDEN.insideCue}`);
		expect(back.mood).not.toContain('familiar 2026 shell');
	});

	it('falls back to the house window when the table skipped the lens', () => {
		const skipped = buildLayerInputs({ futureKey: null, answers: [] });
		expect(skipped.mood).toContain('through the glass, an ordinary mid-rise city');
		expect(skipped.mood).toContain('moody rather than stark');
	});

	it('builds materialsAndLight from q2 (her tone; materials; finish), its scale as a camera clause, its push reply, then q7 and q8', () => {
		expect(built.materialsAndLight).toBe(
			'grey, sand and ochre; board-marked concrete, stone, rough timber; rugged and unpolished. ' +
				'50 mm, eye level, ceilings within reach. ' +
				'raw concrete and brushed steel. ' +
				"a bare table showing the work under someone's hands. " +
				'deliberate pockets of greenery'
		);
	});

	it('keeps q2s push reply and scale pick out of the layer when the table gave neither', () => {
		const quiet = buildLayerInputs({ futureKey: 'solarpunk', answers: [{ questionId: 'q2', keys: ['raw-elemental'] }] });
		expect(quiet.materialsAndLight).toBe('grey, sand and ochre; board-marked concrete, stone, rough timber; rugged and unpolished');
	});

	it('does not pull the zone-worthy questions into the top-level materialsAndLight layer', () => {
		for (const fragment of ['metre-deep desk', 'projected model', 'old forest', 'thresholds changing']) {
			expect(built.materialsAndLight).not.toContain(fragment);
		}
	});

	/**
	 * THE PER-ZONE CAP. The base is prepended to all four zone prompts, so a
	 * fragment here is said four times per table on top of the moment that
	 * already owns it. With the `book` zone set every programme question
	 * (q3, q4w, q5c, q6r) belongs to a zone, so the table-level programme is
	 * empty. q5c's push reply is captured for the wall, not drawn.
	 */
	it('caps the base programme to what no zone owns — nothing, under the book set', () => {
		expect(built.programme).toBe('');
		expect(composeBase(built)).not.toContain('who gets fired');
	});

	it('the zones moment carries that zones own question and its And pick, exactly once', () => {
		const plaza = ZONE_SETS.book.find((z) => z.key === 'plaza')!;
		const prompt = composeZonePrompt(composeBase(built), resolveZone(plaza, ANSWERS), built.negative);
		expect(prompt).toContain("light warming toward the visitor's zone, thresholds changing underfoot as they walk in");
		expect(prompt).toContain('a route lighting ahead of the visitor');
		expect(prompt.split('thresholds changing underfoot')).toHaveLength(2);
		expect(prompt).not.toContain('metre-deep desk');
	});

	it('builds feel from q10s visible consequence, then q11s three light-and-weather clauses in option order — never the bare adjectives', () => {
		expect(built.feel).toBe(
			'half the floor visibly unpowered, people working by hand there, soft even light, still air, one pool of light, shadow around, leaves, water and birds moving'
		);
		expect(built.feel).not.toMatch(/\b(calm|focused|alive)\b/);
	});

	it('draws q10 (it is ◆, "point at where it is visible") but not its hardest pick, which is wall-only', () => {
		expect(WALL_ONLY_IDS).toContain('q10:and');
		expect(composeBase(built)).toContain('half the floor visibly unpowered');
		expect(composeBase(built)).not.toContain('hardest trade-off');
	});

	it('carries the wildcard verbatim, no wrapper', () => {
		expect(built.wildcard).toBe('a room with a working fireplace');
	});

	it('omits the wildcard entirely when nothing was typed', () => {
		expect(buildLayerInputs({ futureKey: 'solarpunk', answers: [] }).wildcard).toBeUndefined();
	});

	it('puts the layout guard first, the house terms, the 2026-office tells, then the futures own, without duplicates', () => {
		expect(built.negative).toBe(
			'collage, grid, split screen, multiple views, labels, personas, stark white, posed faces, ' +
				'paper notebooks, coffee mugs, contemporary office furniture, 2020s laptops, neon signage, dead plants, glare'
		);
	});

	it('keeps paper when the table chose paper and pens for q7, and bans it otherwise', () => {
		const paper = buildLayerInputs({ futureKey: 'solarpunk', answers: [{ questionId: 'q7', keys: ['paper-and-pens'] }] });
		expect(paper.negative).not.toContain('paper notebooks');
		expect(paper.negative).toContain('coffee mugs');
		expect(built.negative).toContain('paper notebooks');
	});

	it('gives every invisible-technology answer a visible effect, never an absence alone', () => {
		const q7 = QUESTIONS.find((q) => q.id === 'q7')!;
		for (const o of q7.options) expect(o.promptFragment, o.key).toMatch(/\b(responding|brightening|showing|mid-task|live|in use)\b/);
	});

	it('names collage in the negative', () => {
		expect(built.negative).toContain('collage');
		expect(built.negative).toContain('split screen');
	});

	it('never lets a lens negative argue with the tables material answer', () => {
		const materialWords = /\b(concrete|timber|wood|chrome|pastel|grey|plastic|screens|minimalism)\b/;
		for (const f of FUTURES) expect(f.negativeFragment, f.key).not.toMatch(materialWords);
	});

	it('ignores an And pick whose parent question was never answered, without a placeholder', () => {
		const orphanAnd = buildLayerInputs({ futureKey: 'solarpunk', answers: [{ questionId: 'q2:and', keys: ['cathedral'] }] });
		expect(orphanAnd.materialsAndLight).toBe('wide lens, low, a tall volume overhead');
		expect(composeBase(orphanAnd)).not.toContain('{');
	});
});

describe('every V4 question reaches a layer or a zone', () => {
	it('is owned by a zone, or feeds materials, or feeds feel — never silently dropped', () => {
		for (const q of QUESTIONS) {
			const reached =
				ZONE_OWNED_IDS.has(q.id) ||
				(MATERIAL_IDS as readonly string[]).includes(q.id) ||
				(FEEL_IDS as readonly string[]).includes(q.id);
			expect(reached, `${q.id} reaches nothing`).toBe(true);
		}
	});

	it('routes each V4 question where the recipe says: one slot per zone', () => {
		const owners = (id: string) => ZONE_SETS.book.filter((z) => z.questionIds.includes(id)).map((z) => z.key);
		expect(owners('q5c')).toEqual(['library']); // deep work -> library
		expect(owners('q4w')).toEqual(['studio']); // workstation -> studio
		expect(owners('q3')).toEqual(['plaza']); // arrival -> plaza
		expect(owners('q6r')).toEqual(['garden']); // biome -> garden
		expect(MATERIAL_IDS).toContain('q8'); // nature -> all zones (via the base)
		expect(MATERIAL_IDS).toContain('q7'); // technology -> all zones (via the base)
		expect(FEEL_IDS).toContain('q10'); // brilliant-at-one -> drawn, last content clause before the light line
		for (const id of ['q7', 'q8', 'q10', 'q11']) expect(ZONE_OWNED_IDS.has(id)).toBe(false);
	});
});

describe('composeBase / composeZonePrompt', () => {
	it('composes a garden-city table on its default era with nothing else answered: frame, window, indoor cue', () => {
		expect(composeBase(buildLayerInputs({ futureKey: 'garden-city', answers: [] }))).toBe(
			`${houseBase('2035')}. ${GARDEN.worldOutside}. ${GARDEN.insideCue}`
		);
	});

	it('orders the base mood, materials, programme, feel, wildcard and adds no guards', () => {
		const base = composeBase(built);
		expect(base.indexOf(built.materialsAndLight)).toBeGreaterThan(base.indexOf(built.mood));
		expect(base.indexOf(built.feel)).toBeGreaterThan(base.indexOf(built.materialsAndLight));
		expect(base.endsWith(built.wildcard!)).toBe(true);
		expect(base).not.toContain(NO_TEXT);
	});

	it('puts the zones moment right after the frame, ahead of the window and the materials (recipe order)', () => {
		const library = ZONE_SETS.book.find((z) => z.key === 'library')!;
		const zone = resolveZone(library, ANSWERS);
		const full = composeZonePrompt(composeBase(built), zone, built.negative);
		const fragments = full.split('. ');
		expect(fragments[0]).toBe(NO_TEXT);
		expect(fragments[1]).toBe(FRAME_2040);
		expect(fragments[2]).toBe(zone.renderSuffix);
		expect(fragments[3]).toBe(ABUNDANT.worldOutside);
		expect(fragments[4]).toBe(ABUNDANT.insideCue);
		expect(fragments.at(-1)).toBe(NO_TEXT);
	});

	it('keeps a base the table rewrote from the first word in the tables own order, moment after', () => {
		const library = ZONE_SETS.book.find((z) => z.key === 'library')!;
		const zone = resolveZone(library, ANSWERS);
		const full = composeZonePrompt('EDITED BY THE TABLE', zone);
		expect(full.startsWith(NO_TEXT)).toBe(true);
		expect(full.endsWith(NO_TEXT)).toBe(true);
		expect(full.indexOf(zone.renderSuffix)).toBeGreaterThan(full.indexOf('EDITED BY THE TABLE'));
	});

	it('resolves the library moment with the deep-work pick and where the AI sits', () => {
		const library = ZONE_SETS.book.find((z) => z.key === 'library')!;
		expect(resolveZone(library, ANSWERS).renderSuffix).toBe(
			'Deep work mid-act, no one posed: three people arguing over a projected model, AI evidence on the walls, the AI present only as light'
		);
	});

	it('resolves the studio moment with the workstation and how much it knows', () => {
		const studio = ZONE_SETS.book.find((z) => z.key === 'studio')!;
		expect(resolveZone(studio, ANSWERS).renderSuffix).toContain(
			'a metre-deep desk, tall acoustic panels three sides, one large screen at work, the desk adjusting itself as someone sits'
		);
	});

	it('resolves the garden moment with the biome and how much of the frame it takes', () => {
		const garden = ZONE_SETS.book.find((z) => z.key === 'garden')!;
		expect(resolveZone(garden, ANSWERS).renderSuffix).toContain(
			'old forest: tall trunks, filtered light, one person thinking slowly alone, the biome filling the frame, floor to ceiling'
		);
	});

	it('falls back to "as the table left it" for an unanswered zone question', () => {
		const library = ZONE_SETS.book.find((z) => z.key === 'library')!;
		const resolved = resolveZone(library, []);
		expect(resolved.renderSuffix).toContain('as the table left it');
		expect(resolved.renderSuffix).not.toContain('{');
	});
});

/**
 * THE WORD BUDGET (prompt-recipe.md §2: 90–130 words per zone, "the board
 * problem came from enumeration; the flatness came from the frame"). A
 * fully answered table — every question, every And, both push replies, a
 * wildcard, a nudged era — must stay within the 175-word budget in every
 * zone (recipe v2: the indoor cue, the 2026 tells and the work acts cost
 * the old 160), with the zone's moment present. The second case stacks the
 * LONGEST option of every question and documents the ceiling that
 * combination reaches (189 measured on 20 Sep with recipe v2).
 */
describe('word budget', () => {
	const base = composeBase(built);

	it.each(ZONE_SETS.book.map((z) => z.key))('a fully answered tables %s prompt is within the 175-word budget and contains its moment', (key) => {
		const zone = ZONE_SETS.book.find((z) => z.key === key)!;
		const resolved = resolveZone(zone, ANSWERS);
		const prompt = composeZonePrompt(base, resolved, built.negative);
		expect(wordCount(prompt)).toBeLessThanOrEqual(175);
		expect(wordCount(prompt)).toBeGreaterThan(90);
		expect(prompt).toContain(resolved.renderSuffix);
		expect(prompt).toContain(zone.moment.split(/[:;]/)[0]); // the subject, before its slot
	});

	it('stays at or under 190 words even with the longest option of every question stacked', () => {
		const longest: AnswerLike[] = QUESTIONS.flatMap((q) => {
			const n = q.select.kind === 'pick' ? q.select.n : 1;
			const byLength = (a: { promptFragment: string }, b: { promptFragment: string }) =>
				wordCount(b.promptFragment) - wordCount(a.promptFragment);
			const rows: AnswerLike[] = [
				{ questionId: q.id, keys: [...q.options].sort(byLength).slice(0, n).map((o) => o.key), pushReply: q.pushCapturesReply ? 'raw concrete and brushed steel' : undefined }
			];
			if (q.and) rows.push({ questionId: `${q.id}:and`, keys: [[...q.and.options].sort(byLength)[0].key] });
			return rows;
		});
		longest.push({ questionId: 'q1', keys: ['hyperfuturistic-2040'] });
		longest.push({ questionId: 'wildcard', keys: ['wildcard-open'], text: { 'wildcard-open': 'a room with a working fireplace' } });
		for (const future of FUTURES) {
			const b = buildLayerInputs({ futureKey: future.key, era: 'hyperfuturistic-2040', answers: longest });
			for (const zone of ZONE_SETS.book) {
				expect(wordCount(composeZonePrompt(composeBase(b), resolveZone(zone, longest), b.negative)), `${future.key}/${zone.key}`).toBeLessThanOrEqual(190);
			}
		}
	});
});
