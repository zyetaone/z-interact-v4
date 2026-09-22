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
import { IMPOSSIBLE_IDEAS, ZONE_SETS, impossibleIdea } from '$lib/game/zones';
import { sanitizeComposed, NO_TEXT, houseBase } from '$lib/server/prompt';
import {
	FEEL_IDS,
	MATERIAL_IDS,
	ROOM_PARTICIPATES,
	WALL_ONLY_IDS,
	ZONE_OWNED_IDS,
	buildLayerInputs,
	composeBase,
	composeZonePrompt,
	resolveZone,
	wordCount,
	type AnswerLike
, HOUSE_REGISTER} from './layers';

const ABUNDANT = FUTURES.find((f) => f.key === 'solarpunk')!;
const GARDEN = FUTURES.find((f) => f.key === 'garden-city')!;
const FRAME_2040 =
	'A film still, a 2040 workplace: anamorphic 35 mm, volumetric light, ' +
	'bright overall exposure, daylight filling the volume, open shadows, no logos';

/** A fully answered table: every question, every And, both push replies, the wildcard, a nudged era. */
const ANSWERS: AnswerLike[] = [
	{ questionId: 'q1', keys: ['hyperfuturistic-2040'] },
	{ questionId: 'q2', keys: ['raw-elemental'], pushReply: 'raw concrete and brushed steel' },
	{ questionId: 'q2:and', keys: ['human'] },
	{ questionId: 'q5c', keys: ['glass-dome'], pushReply: 'who gets fired' },
	{ questionId: 'q5c:and', keys: ['in-the-light'] },
	{ questionId: 'q6r', keys: ['tea-room'] },
	{ questionId: 'q6r:and', keys: ['fully-immersive'] },
	{ questionId: 'q8', keys: ['deliberate-pockets'] },
	// A V4 row, kept deliberately: `ROOM_PARTICIPATES` still has to compose
	// for a table that answered before the cut and is regenerated after it.
	{ questionId: 'q7', keys: ['surfaces-wake-up'] },
	{ questionId: 'wildcard', keys: ['wildcard-open'], text: { 'wildcard-open': 'a room with a working fireplace' } }
];

const built = buildLayerInputs({ futureKey: 'solarpunk', era: 'hyperfuturistic-2040', answers: ANSWERS });

describe('buildLayerInputs', () => {
	it('opens mood with the frame in the chips year, then the lenss styleDna, the window, its indoor 2040 cue, then the tables one impossible idea', () => {
		expect(built.mood).toBe(
			`${FRAME_2040}. ${ABUNDANT.styleDna}. ${ABUNDANT.worldOutside}. ${ABUNDANT.insideCue}. ${IMPOSSIBLE_IDEAS.solarpunk[0]}`
		);
		expect(houseBase('2040')).toBe(FRAME_2040);
	});

	it('gives every lens five impossible ideas, picked by table seed so a rooms four zones share one', () => {
		for (const f of FUTURES) {
			// Five since 20 Sep, not two: with one image per table, two ideas
			// handed every odd table on a lens the same clause.
			expect(IMPOSSIBLE_IDEAS[f.key], f.key).toHaveLength(5);
			for (const idea of IMPOSSIBLE_IDEAS[f.key]) expect(wordCount(idea), f.key).toBeLessThanOrEqual(14);
		}
		// Seeded on `table - 1`, so table 1 takes the first and consecutive
		// tables walk the pool.
		expect(impossibleIdea('solarpunk', 1)).toBe(IMPOSSIBLE_IDEAS.solarpunk[0]);
		expect(impossibleIdea('solarpunk', 7)).toBe(IMPOSSIBLE_IDEAS.solarpunk[1]);
		expect(impossibleIdea('solarpunk', 8)).toBe(IMPOSSIBLE_IDEAS.solarpunk[2]);
		expect(impossibleIdea(null, 3)).toBeUndefined();
		const t7 = buildLayerInputs({ futureKey: 'solarpunk', answers: ANSWERS, table: 7 });
		const base7 = composeBase(t7);
		for (const zone of ZONE_SETS.book) {
			expect(composeZonePrompt(base7, resolveZone(zone, ANSWERS), t7.negative)).toContain(IMPOSSIBLE_IDEAS.solarpunk[1]);
		}
	});

	/**
	 * The phrase that used to collide here came from q5c's "And: where does
	 * the AI sit?" pick ("the AI unseen, no device anywhere"), and the "And:"
	 * rows were removed on 21 Sep. The DEDUPLICATION is not removed, so the
	 * collision is driven from the option fragment that still says it —
	 * `sealed-cell`'s "no screens and no devices" against q7's
	 * "no device anywhere". Same machinery, a source that still exists.
	 */
	it('drops a moment phrase the room-participates clause already says (no device anywhere, once)', () => {
		const answers = [
			{ questionId: 'q5c', keys: ['sealed-cell'] },
			{ questionId: 'q7', keys: ['nothing-to-see'] }
		];
		const inp = buildLayerInputs({ futureKey: 'solarpunk', answers });
		const library = ZONE_SETS.book.find((z) => z.key === 'library')!;
		const prompt = composeZonePrompt(composeBase(inp), resolveZone(library, answers), inp.negative);
		expect(prompt.match(/no device anywhere/g)).toHaveLength(1);
		expect(prompt).toContain(ROOM_PARTICIPATES['nothing-to-see']);
	});

	/**
	 * q7 was cut by the 21 Sep minutes, and this test did NOT go with it. Rows
	 * answered under V4 still carry q7 keys, and regenerating one of those
	 * rows has to compose what it composed before — so the lookup has to keep
	 * working after the question stops being asked.
	 */
	it('still composes the room participating for a V4 row, though q7 is no longer asked', () => {
		expect(QUESTIONS.find((q) => q.id === 'q7'), 'q7 should be cut from the asked set').toBeUndefined();
		for (const [key, clause] of Object.entries(ROOM_PARTICIPATES)) {
			expect(clause, key).toMatch(/\b(warms|brightens|dims|wakes|shows|is|following|carries|stays|rewritten)\b/);
		}
		const wall = buildLayerInputs({ futureKey: 'solarpunk', answers: [{ questionId: 'q7', keys: ['light-and-sound'] }] });
		expect(wall.materialsAndLight).toBe('a wall brightens toward whoever walks to it and dims behind them');
	});

	it('gives every lens a styleDna of eighteen words or fewer — its cards visual signatures, the indoor carrier of the lens', () => {
		for (const f of FUTURES) expect(wordCount(f.styleDna), f.key).toBeLessThanOrEqual(18);
	});

	/**
	 * A lens must keep its identity at any time of day (recipe v2 addendum):
	 * "a dense and lit city workspace, but by day" still has to read as that
	 * lens. So nothing the lens contributes may name a time of day or the
	 * weather — q11's feel words alone own light, weather and time.
	 */
	it('never lets a lens name a time of day or the weather — styleDna, window, cue and negative are day-neutral', () => {
		const timeOrWeather = /\b(night|day|daylight|dusk|dawn|evening|morning|golden hour|last warm hour|rain|rain-slick|mist|fog|haze|sunlit|sunset|glare|shadow)\b/i;
		for (const f of FUTURES) {
			for (const clause of [f.styleDna, f.worldOutside, f.insideCue, f.negativeFragment]) expect(clause, f.key).not.toMatch(timeOrWeather);
		}
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
		expect(onDefault.mood).toBe(
			`${houseBase('2035')}. ${ABUNDANT.styleDna}. ${ABUNDANT.worldOutside}. ${ABUNDANT.insideCue}. ${IMPOSSIBLE_IDEAS.solarpunk[0]}`
		);
		const back = buildLayerInputs({ futureKey: 'garden-city', era: 'same-as-2026', answers: [{ questionId: 'q1', keys: ['same-as-2026'] }] });
		expect(back.mood).toBe(
			`${houseBase('2026')}. ${GARDEN.styleDna}. ${GARDEN.worldOutside}. ${GARDEN.insideCue}. ${IMPOSSIBLE_IDEAS['garden-city'][0]}`
		);
		expect(back.mood).not.toContain('familiar 2026 shell');
	});

	it('falls back to the house window when the table skipped the lens', () => {
		const skipped = buildLayerInputs({ futureKey: null, answers: [] });
		expect(skipped.mood).toContain('through the glass, an ordinary mid-rise city');
		expect(skipped.mood).toContain(HOUSE_REGISTER);
	});

	// The scale clause ("eye level, ceilings within reach") was q2's "And:"
	// pick and went with the rest of them on 21 Sep. The camera is now said
	// once, by the frame, rather than chosen per table.
	it('builds materialsAndLight from q2 (her tone; materials; finish), its push reply, then the room participating (q7) and q8', () => {
		expect(built.materialsAndLight).toBe(
			'grey, sand and ochre; board-marked concrete, stone, rough timber; rugged and unpolished. ' +
				'raw concrete and brushed steel. ' +
				'a bare table wakes under their hands and shows the work. ' +
				'deliberate pockets of greenery'
		);
	});

	it('keeps q2s push reply and scale pick out of the layer when the table gave neither', () => {
		const quiet = buildLayerInputs({ futureKey: 'solarpunk', answers: [{ questionId: 'q2', keys: ['raw-elemental'] }] });
		expect(quiet.materialsAndLight).toBe('grey, sand and ochre; board-marked concrete, stone, rough timber; rugged and unpolished');
	});

	it('does not pull the zone-worthy questions into the top-level materialsAndLight layer', () => {
		for (const fragment of ['metre-deep desk', 'glass slab', 'old forest', 'thresholds shifting']) {
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

	it('the zones moment carries that zones own question, exactly once', () => {
		const library = ZONE_SETS.book.find((z) => z.key === 'library')!;
		const prompt = composeZonePrompt(composeBase(built), resolveZone(library, ANSWERS), built.negative);
		const moment = 'a glass geodesic room standing alone among mature trees';
		expect(prompt).toContain(moment);
		expect(prompt.split(moment)).toHaveLength(2);
		expect(prompt).not.toContain('tatami'); // the garden's question, not this zone's
	});

	/**
	 * THE FEEL LAYER IS THE LENS'S NOW. q10 and q11 supplied it and both are
	 * cut; the owner's call was to fold light, weather and time back into the
	 * lens. The danger that creates is the one `moodLine` already caused
	 * once, so the second assertion is the guard: no lens may describe its
	 * light as dark.
	 */
	it('builds feel from the chosen lens light line, and from nothing else', () => {
		expect(built.feel).toBe(FUTURES.find((f) => f.key === 'solarpunk')!.lightLine);
		expect(buildLayerInputs({ futureKey: undefined, answers: ANSWERS }).feel).toBe('');
	});

	it('never lets a lens light line put the room back in the dark', () => {
		for (const f of FUTURES) {
			expect(f.lightLine, f.key).toMatch(/\b(sun|sunlit|daylight|bright|light)\b/i);
			expect(f.lightLine, f.key).not.toMatch(/\b(night|dusk|evening|twilight|unlit|gloom|dim|darkness)\b/i);
		}
	});

	it('carries the wildcard verbatim, no wrapper', () => {
		expect(built.wildcard).toBe('a room with a working fireplace');
	});

	it('omits the wildcard entirely when nothing was typed', () => {
		expect(buildLayerInputs({ futureKey: 'solarpunk', answers: [] }).wildcard).toBeUndefined();
	});

	it('puts the layout guard first, the house terms, the 2026-office tells, then the futures own, without duplicates', () => {
		expect(built.negative).toBe(
			'collage, grid, split screen, labels, personas, stark white, posed faces, ' +
				'paper notebooks, coffee mugs, 2020s office furniture, laptops, neon signage, dead plants, ' +
				'underexposed, murky, crushed blacks, gloom'
		);
	});

	it('keeps paper when the table chose paper and pens for q7, and bans it otherwise', () => {
		const paper = buildLayerInputs({ futureKey: 'solarpunk', answers: [{ questionId: 'q7', keys: ['paper-and-pens'] }] });
		expect(paper.negative).not.toContain('paper notebooks');
		expect(paper.negative).toContain('coffee mugs');
		expect(built.negative).toContain('paper notebooks');
	});

	it('names collage in the negative', () => {
		expect(built.negative).toContain('collage');
		expect(built.negative).toContain('split screen');
	});

	it('never lets a lens negative argue with the tables material answer', () => {
		const materialWords = /\b(concrete|timber|wood|chrome|pastel|grey|plastic|screens|minimalism)\b/;
		for (const f of FUTURES) expect(f.negativeFragment, f.key).not.toMatch(materialWords);
	});

	/**
	 * A STORED `:and` ROW IS NOW INERT, AND THAT IS THE POINT OF THIS TEST.
	 *
	 * Until 21 Sep this asserted the opposite — an orphan "And:" pick still
	 * composed its fragment. The rows were removed that evening, and
	 * `OPTIONS_BY_ID` builds its `<qid>:and` entries by filtering `q.and`,
	 * so taking the data out took the lookup with it.
	 *
	 * That is a deliberate difference from `RETIRED_ZONES`. A zone key is
	 * structural — an image row cannot be labelled without one — so it must
	 * resolve for ever. An "And:" fragment is additive to a prompt, so a
	 * regenerated old render loses one clause instead of breaking.
	 *
	 * What must NOT change is the second assertion: whatever happens to the
	 * fragment, no `{text}` placeholder may reach a prompt.
	 */
	it('composes nothing from a stored And pick, and leaks no placeholder', () => {
		const orphanAnd = buildLayerInputs({ futureKey: 'solarpunk', answers: [{ questionId: 'q2:and', keys: ['cathedral'] }] });
		expect(orphanAnd.materialsAndLight).toBe('');
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

	it('routes each surviving question where the minutes leave it: one slot per zone', () => {
		const owners = (id: string) => ZONE_SETS.book.filter((z) => z.questionIds.includes(id)).map((z) => z.key);
		expect(owners('q5c')).toEqual(['library']); // deep work (workstation merged in) -> library
		expect(owners('q6r')).toEqual(['garden']); // recharge -> garden
		// The two quality questions ride the BASE, into every zone. They are
		// not acts and a zone moment cannot hold them — see `zones.ts`.
		expect(MATERIAL_IDS).toContain('q2');
		expect(MATERIAL_IDS).toContain('q8');
		// Every asked question now owns a zone, so nothing is left to carry
		// through the base except the retired ids a V4 row may still hold.
		expect(FEEL_IDS).toEqual([]);
		for (const id of ['q3', 'q4w', 'q7', 'q10', 'q11']) expect(ZONE_OWNED_IDS.has(id)).toBe(false);
	});
});

describe('composeBase / composeZonePrompt', () => {
	it('composes a garden-city table on its default era with nothing else answered: frame, window, indoor cue', () => {
		// The lens's own light line closes it now — the `feel` layer is the
		// lens's since q11 was cut, so even a table that answered nothing has one.
		expect(composeBase(buildLayerInputs({ futureKey: 'garden-city', answers: [] }))).toBe(
			`${houseBase('2035')}. ${GARDEN.styleDna}. ${GARDEN.worldOutside}. ${GARDEN.insideCue}. ${IMPOSSIBLE_IDEAS['garden-city'][0]}. ${GARDEN.lightLine}`
		);
	});

	it('orders the base mood, materials, programme, feel, wildcard and adds no guards', () => {
		const base = composeBase(built);
		expect(base.indexOf(built.materialsAndLight)).toBeGreaterThan(base.indexOf(built.mood));
		expect(base.indexOf(built.feel)).toBeGreaterThan(base.indexOf(built.materialsAndLight));
		expect(base.endsWith(built.wildcard!)).toBe(true);
		expect(base).not.toContain(NO_TEXT);
	});

	it('puts the zones moment right after the frame, then the styleDna, the window, the cue, then the materials (recipe order)', () => {
		const library = ZONE_SETS.book.find((z) => z.key === 'library')!;
		const zone = resolveZone(library, ANSWERS);
		const full = composeZonePrompt(composeBase(built), zone, built.negative);
		const fragments = full.split('. ');
		expect(fragments[0]).toBe(NO_TEXT);
		expect(fragments[1]).toBe(FRAME_2040);
		expect(fragments[2]).toBe(zone.renderSuffix);
		expect(fragments[3]).toBe(ABUNDANT.styleDna);
		expect(fragments[4]).toBe(ABUNDANT.worldOutside);
		expect(fragments[5]).toBe(ABUNDANT.insideCue);
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

	it('resolves the library moment with the deep-work pick', () => {
		const library = ZONE_SETS.book.find((z) => z.key === 'library')!;
		expect(resolveZone(library, ANSWERS).renderSuffix).toBe(
			'Deep work mid-act, no one posed: a glass geodesic room standing alone among mature trees, one person working inside, forest pressing against every pane'
		);
	});

	it('resolves the garden moment with the biome and how much of the frame it takes', () => {
		const garden = ZONE_SETS.book.find((z) => z.key === 'garden')!;
		expect(resolveZone(garden, ANSWERS).renderSuffix).toContain(
			'a small tatami room whose paper screens are slid open to a garden, a low kettle and a single flower, people kneeling on the mats'
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
 * wildcard, a nudged era — must stay within 180 words in every zone (the
 * brief's 175 plus the five that variant E's three ingredients — the act
 * with a visible object, the room participating, one impossible idea —
 * could not be trimmed back out without losing them; the trade is the
 * lead's), with the zone's moment present. The second case stacks the
 * LONGEST option of every question and documents the ceiling that
 * combination reaches (measured 20 Sep with recipe v2, styleDna, variant E).
 */
describe('word budget', () => {
	const base = composeBase(built);

	/**
	 * The budget was 180, and the exposure clause cost 14 words of it: nine in
	 * the frame (`EXPOSURE`) and five in the Avoid list
	 * (`UNDEREXPOSED_NEGATIVE`), said from both sides because the positive
	 * alone did not move the luminance when the hero was measured. 195 is 180
	 * plus that and a word to spare, not a budget quietly relaxed.
	 *
	 * The word count is a style guard. The one that actually bites is
	 * `MAX_COMPOSED_CHARS`: a prompt over it is TRUNCATED by
	 * `sanitizeComposed`, and what falls off the end is the Avoid list and the
	 * closing no-text guard. So each case asserts it is not truncated too —
	 * a fully answered table now sits around 1,100 of the 1,200 characters.
	 */
	it.each(ZONE_SETS.book.map((z) => z.key))('a fully answered tables %s prompt is within the 195-word budget, untruncated, and contains its moment', (key) => {
		const zone = ZONE_SETS.book.find((z) => z.key === key)!;
		const resolved = resolveZone(zone, ANSWERS);
		const prompt = composeZonePrompt(base, resolved, built.negative);
		expect(sanitizeComposed(prompt), 'truncated — the Avoid list and the closing guard fall off the end').toBe(prompt);
		expect(wordCount(prompt)).toBeLessThanOrEqual(195);
		expect(wordCount(prompt)).toBeGreaterThan(90);
		expect(prompt).toContain(resolved.renderSuffix);
		expect(prompt).toContain(zone.moment.split(/[:;]/)[0]); // the subject, before its slot
	});

	it('stays at or under 220 words even with the longest option of every question stacked', () => {
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
				expect(wordCount(composeZonePrompt(composeBase(b), resolveZone(zone, longest), b.negative)), `${future.key}/${zone.key}`).toBeLessThanOrEqual(220);
			}
		}
	});
});
