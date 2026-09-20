/**
 * THE LAYER BUILDER — turning a table's stored answers into `prompt.ts`'s
 * four `LayerInputs` plus the negative prompt.
 *
 * Pure. No D1, no `$app/server`, no fetch — `layers.test.ts` drives it with
 * fixed answers and asserts the exact layer strings.
 *
 * Mapping, re-derived for VERSION 4 of the questions (`game/questions.ts`)
 * and prompt-recipe.md's five moves. These are the TOP-LEVEL table-wide
 * layers (the screen 15 textarea) — the zone-worthy questions (q3 arrival,
 * q4w workstation, q5c centaur deep work, q6r recharge) are deliberately
 * NOT pulled in here even though they're answered: they feed the per-zone
 * `moment` instead (`zones.ts`), which is the more specific place their
 * content belongs. `resolveZone` below reads them from the raw answers.
 *
 * BUDGET: the recipe targets 90–130 words per submitted zone prompt and
 * `layers.test.ts` holds a fully answered table under 160. Every clause
 * here is short because of that, and two answers are deliberately not
 * composed at all (`WALL_ONLY_IDS`).
 *
 *   mood             <- the fixed cinematic frame (a film still from a
 *                       workplace in <year>, anamorphic, volumetric — see
 *                       `prompt.ts`'s `houseBase`), THEN the chosen future's
 *                       `styleDna` (its card's visual signatures, the indoor
 *                       carrier of the lens), its `worldOutside` (the window:
 *                       structures, density, signage, two materials — never
 *                       its name, its mood paragraph, or an hour of the day),
 *                       THEN its `insideCue` (one indoor 2040 tell, recipe v2),
 *                       THEN the table's one impossible idea (`zones.ts`,
 *                       seeded by table number so its four zones share it)
 *                       `<year>` comes from the era chip (V4 has no era
 *                       question; the chip's row still stores under `q1`),
 *                       so a nudge shows up in the frame and nowhere else.
 *   materialsAndLight<- q2's option fragment, its "And: what scale?" pick
 *                       (a lens-and-height clause), its push reply verbatim
 *                       (the two materials), then the room participating
 *                       (`ROOM_PARTICIPATES`, keyed by q7) and q8 (nature);
 *                       all reach every zone, because the base is
 *                       prepended to all four
 *   programme        <- q3, q4w, q5c, q6r fragments, MINUS whatever a zone
 *                       already owns (all four, under the `book` set) —
 *                       plus q12 (urban edge / ground plane) ONLY when
 *                       `ENABLE_PROPOSED_QUESTIONS` is on
 *   feel             <- q10's strength as one visible consequence, then
 *                       q11's three picks as light-and-weather clauses
 *                       (`questions.ts` holds both tables) — a comma list
 *   (not drawn)      <- q10's "hardest" pick and q5c's push reply: captured
 *                       for the wall and the export, see `WALL_ONLY_IDS`
 *   wildcard         <- verbatim, never rewritten
 *   negative         <- the layout guard, the house terms, the 2026-office
 *                       tells (`NO_2026`, paper kept when q7 chose it), then
 *                       the future's own `negativeFragment`
 *
 * An "And:" sub-question's pick is stored under `<qid>:and` (`andId`) and
 * rides with its parent: `fragmentsWithAnd` is the one place that pairs
 * them, for the base layers and for a zone's `{qN}` alike — so q4w's "how
 * much it knows" (tech visibility) lands in the studio with the desk.
 *
 * ORDER PER ZONE (prompt-recipe.md §2): frame → the zone's moment → window
 * → materials + scale → the zone's one or two facts → tech → nature → feel
 * → wildcard → Avoid → guard. `composeZonePrompt` gets the moment into
 * second place by recognising the frame at the head of the stored base.
 *
 * **One prompt row per table, not per zone.** `composeBase` is the
 * table-level text screen 15 puts in the editable textarea. The per-zone
 * string actually submitted to fal is `composeZonePrompt`, which wraps that
 * base in `prompt.ts`'s NO_TEXT guards and appends the zone's own suffix
 * with its `{qN}` placeholders resolved. That keeps one composer for both
 * the edited and the unedited case: an edit replaces the base, and the
 * guards and suffix are re-applied identically either way.
 */
import { ACTIVE_QUESTIONS, andId, WILDCARD, type Question, type QuestionOption } from '$lib/game/questions';
import { FUTURES, HOUSE_NEGATIVE, type Future } from '$lib/game/futures';
import { ERA_SCALE, type Era } from '$lib/game/era';
import { ENABLE_PROPOSED_QUESTIONS } from '$lib/game/config';
import { ZONES, impossibleIdea, type Zone } from '$lib/game/zones';
import { FRAME_HEAD, NO_COLLAGE, composeLayers, houseBase, sanitizeComposed, type LayerInputs, type ZoneRef } from '$lib/server/prompt';

/** The house base's year label per era chip value — the frame line reads the
 *  table's actual era chip, so a nudge toward 2040 (or back to 1930s) shows
 *  up in the opening line too, not just in the mood clause after it. */
const ERA_YEAR: Record<Era, string> = {
    'retro-1930s': '1930s-revival',
    'same-as-2026': '2026',
    'recognisably-2035': '2035',
    'hyperfuturistic-2040': '2040'
};

/** The subset of `room.ts`'s `AnswerRow` this builder reads. */
export interface AnswerLike {
	questionId: string;
	keys: string[];
	text?: Record<string, string>;
	pushReply?: string;
}

export interface LayerBuildInput {
	futureKey?: string | null;
	era?: Era | null;
	answers: readonly AnswerLike[];
	/** Seeds the table's one impossible idea (`zones.ts`), so its four zones share it. */
	table?: number | null;
}

/**
 * THE ROOM PARTICIPATES (recipe v2, from the one-table loop): the winning
 * frames had the room reacting to the people in it. One full clause per q7
 * option — the invisible-technology answers become a visible effect on the
 * people — composed IN PLACE of q7's option fragment (that fragment still
 * drives the option picture).
 */
export const ROOM_PARTICIPATES: Record<string, string> = {
	'nothing-to-see': 'the stone underfoot warms with light as they step, no device anywhere',
	'light-and-sound': 'a wall brightens toward whoever walks to it and dims behind them',
	'surfaces-wake-up': 'a bare table wakes under their hands and shows the work',
	'screens-everywhere': 'every wall is a live screen, the data following them across the floor',
	'has-a-body': 'a small robot carries the work between them, mid-task',
	'paper-and-pens': 'the room stays still; paper on the walls, pinned and rewritten by hand'
};

export interface BuiltLayers extends LayerInputs {
	/** The future's terms behind the house terms. Stored on the prompt row, sent alongside. */
	negative: string;
}

/** The window when a table skips the lens (game-flow §1 screen 3's failure state) — an ordinary city, moody rather than stark. */
export const HOUSE_REGISTER =
	'through the glass, an ordinary mid-rise city; moody rather than stark, pooled light, shadow held deliberately';



export const QUESTION_BY_ID: ReadonlyMap<string, Question> = new Map(ACTIVE_QUESTIONS.map((q) => [q.id, q]));

/** Every answer id that carries option fragments: each question, plus `<qid>:and` for its sub-question. */
const OPTIONS_BY_ID: ReadonlyMap<string, readonly QuestionOption[]> = new Map([
	...ACTIVE_QUESTIONS.map((q) => [q.id, q.options] as const),
	...ACTIVE_QUESTIONS.filter((q) => q.and).map((q) => [andId(q.id), q.and!.options] as const)
]);

/** Which V4 question feeds which table-level layer. Exported so a test can prove no question is orphaned. */
export const MATERIAL_IDS = ['q2', 'q7', 'q8'] as const;
export const PROGRAMME_IDS = ['q3', 'q4w', 'q5c', 'q6r'] as const;
/** q10 (brilliant at one) is ◆ and its push line is "point at the exact place in your image
 *  where your choice is visible" — so it is drawn, as one short visible consequence, the last
 *  content clause before the light-and-weather line in every zone. */
export const FEEL_IDS = ['q10', 'q11'] as const;
/** Answered for the wall and the ledger, never drawn: q10's "hardest" pick is a sentence
 *  about the table, not a subject. It stays on the review screen and in the export. */
export const WALL_ONLY_IDS = ['q10:and'] as const;

export function futureByKey(key: string | null | undefined): Future | undefined {
	return key ? FUTURES.find((f) => f.key === key) : undefined;
}

/** Splices an `open` option's typed reply into its `{text}` slot; drops the clause when nothing was typed. */
function fragmentOf(option: QuestionOption, typed: string | undefined): string {
	if (!option.promptFragment.includes('{text}')) return option.promptFragment;
	const reply = (typed ?? '').trim();
	// Nothing typed: drop the slot AND the punctuation that introduced it
	// ("...the table specifies: {text}, deliberately missing" must not ship a
	// dangling colon), then tidy the seam the removal leaves behind.
	if (!reply) {
		return option.promptFragment
			.replace(/[:,]?\s*\{text\}/, '')
			.replace(/\s+([,.])/g, '$1')
			.replace(/[\s,:]+$/, '');
	}
	return option.promptFragment.replace('{text}', reply);
}

/** Every selected option's fragment for one question, in the question's own option order. */
export function fragmentsFor(answer: AnswerLike | undefined): string[] {
	if (!answer) return [];
	const options = OPTIONS_BY_ID.get(answer.questionId);
	if (!options) return [];
	const chosen = new Set(answer.keys);
	return options.filter((o) => chosen.has(o.key)).map((o) => fragmentOf(o, answer.text?.[o.key]));
}

/** A question's fragments followed by its "And:" pick's, so the pair is never split. */
function fragmentsWithAnd(by: ReadonlyMap<string, AnswerLike>, id: string): string[] {
	return [...fragmentsFor(by.get(id)), ...fragmentsFor(by.get(andId(id)))];
}

function joinClauses(parts: readonly (string | undefined)[]): string {
	return parts
		.map((p) => (p ?? '').trim().replace(/[.\s]+$/, ''))
		.filter((p) => p.length > 0)
		.join('. ');
}

function answerMap(answers: readonly AnswerLike[]): Map<string, AnswerLike> {
	return new Map(answers.map((a) => [a.questionId, a]));
}

/**
 * Every question id that some zone's own `renderSuffix` already resolves.
 * The table-level base must NOT also enumerate these: the base is prepended
 * to every zone's prompt, so a fragment in both places is said twice per
 * zone and four times per table — and an enumeration of ten programme items
 * is exactly what produced a presentation board in the fidelity run.
 *
 * Push replies are deliberately NOT capped. They are the table's own
 * sentences, one line each, and a sentence does not read as an item in a
 * list the way a stack of option fragments does.
 */
export const ZONE_OWNED_IDS: ReadonlySet<string> = new Set(ZONES.flatMap((z) => z.questionIds));

/**
 * The 2026-office tells the first wall showed (recipe v2, §4): kept out of
 * every render, except that paper stays when the table chose it (q7).
 */
export const NO_2026 = 'paper notebooks, coffee mugs, 2020s office furniture, laptops';
const NO_2026_KEEP_PAPER = NO_2026.replace('paper notebooks, ', '');

/** The layout guard first, the house terms, the 2026 tells, then the future's own; duplicates dropped, order preserved. */
export function composeNegative(futureNegative: string | undefined, paperChosen = false): string {
	const seen = new Set<string>();
	const out: string[] = [];
	const no2026 = paperChosen ? NO_2026_KEEP_PAPER : NO_2026;
	for (const term of `${NO_COLLAGE}, ${HOUSE_NEGATIVE}, ${no2026}, ${futureNegative ?? ''}`.split(',')) {
		const t = term.trim();
		if (!t || seen.has(t.toLowerCase())) continue;
		seen.add(t.toLowerCase());
		out.push(t);
	}
	return out.join(', ');
}

export function buildLayerInputs(input: LayerBuildInput): BuiltLayers {
	const by = answerMap(input.answers);
	const future = futureByKey(input.futureKey);

	// --- mood: the fixed cinematic frame (the era chip sets its year — a
	// nudge shows up there, and nowhere else), THEN the world through the
	// window, which is all the lens contributes (recipe §2, move 3). The
	// future's NAME never enters the prompt.
	const eraAnswer = by.get('q1');
	const era = input.era ?? ((eraAnswer?.keys[0] as Era | undefined) ?? future?.eraDefault ?? null);
	const base = houseBase(ERA_YEAR[era ?? 'recognisably-2035']);
	const window = future ? future.worldOutside : HOUSE_REGISTER;
	// Recipe v2: the lens's styleDna (its card's visual signatures) right
	// after the frame — so it lands directly after the zone's moment once
	// composeZonePrompt splits the frame off — then the window, then one
	// unmistakable indoor 2040 cue. None of the three names a time of day.
	// ...then the table's ONE impossible idea, shared by all four zones.
	const mood = joinClauses([
		base,
		future?.styleDna,
		window,
		future?.insideCue,
		impossibleIdea(future?.key, input.table),
		eraAnswer?.pushReply
	]);

	// --- materials & light: q2 (her tone; materials; finish) + its scale
	// pick (the camera) + its push reply, then the room participating (q7's
	// ROOM_PARTICIPATES clause) and nature (q8) — all carried into every
	// zone through the base. q4w's "how much
	// it knows" clause rides with the workstation in the studio's moment
	// rather than here: at the base it cost eight words in all four zones.
	const roomParticipates = (by.get('q7')?.keys ?? []).map((k) => ROOM_PARTICIPATES[k]).filter(Boolean);
	const materialsAndLight = joinClauses([
		...fragmentsWithAnd(by, 'q2'),
		by.get('q2')?.pushReply,
		...roomParticipates,
		...fragmentsFor(by.get('q8'))
	]);

	// --- programme: the zone-worthy questions MINUS what a zone owns, plus
	// q12 (urban edge / ground plane) when the proposed-question flag is on.
	//
	// PER-ZONE CAP: anything a zone's own moment resolves is dropped here, so
	// each zone's prompt carries its own fact once instead of the whole
	// room's, four times over. With the `book` zone set every one of these
	// is zone-owned and the base programme is empty, which is correct — the
	// deep-work room belongs in the library and arrival belongs in the
	// plaza; saying both in all four is what invited a board. q5c's push
	// reply (what the table refused to automate) is captured for the wall,
	// not drawn: a sentence about a decision has no subject to paint.
	const programmeIds = (ENABLE_PROPOSED_QUESTIONS ? [...PROGRAMME_IDS, 'q12'] : [...PROGRAMME_IDS]).filter(
		(id) => !ZONE_OWNED_IDS.has(id)
	);
	const programme = joinClauses(programmeIds.flatMap((id) => fragmentsWithAnd(by, id)));

	// --- feel: q10's visible consequence, then q11's three picks as
	// light-and-weather clauses (recipe §2, move 5) — a comma list. q10's
	// "hardest" And is `WALL_ONLY_IDS`, so `fragmentsFor`, not `fragmentsWithAnd`.
	const feel = FEEL_IDS.flatMap((id) => fragmentsFor(by.get(id))).join(', ');

	// --- wildcard: verbatim, through its own `{text}` slot.
	const wildcardAnswer = by.get(WILDCARD.id);
	const wildcardText = wildcardAnswer?.text?.[WILDCARD.options[0].key]?.trim();
	const wildcard = wildcardText ? fragmentOf(WILDCARD.options[0], wildcardText) : undefined;

	const paperChosen = !!by.get('q7')?.keys.includes('paper-and-pens');
	return { mood, materialsAndLight, programme, feel, wildcard, negative: composeNegative(future?.negativeFragment, paperChosen) };
}

/**
 * The table-level prompt text: the four layers plus the wildcard, with no
 * NO_TEXT guards and no zone suffix. This is what the `prompt` row stores as
 * `composed` and what screen 15's textarea edits.
 */
export function composeBase(layers: LayerInputs): string {
	return joinClauses([layers.mood, layers.materialsAndLight, layers.programme, layers.feel, layers.wildcard]);
}

/** Fills a zone's `{qN}` placeholders from the table's answers — each question's fragment plus its "And:" pick's. */
export function resolveZone(zone: Zone, answers: readonly AnswerLike[]): ZoneRef {
	const by = answerMap(answers);
	const renderSuffix = zone.renderSuffix.replace(/\{(q\w+)\}/g, (_m, id: string) => {
		const fragments = fragmentsWithAnd(by, id);
		return fragments.length ? fragments.join(', ') : 'as the table left it';
	});
	return { key: zone.key, renderSuffix };
}

/**
 * The exact string submitted to fal for one zone. The base (edited or not)
 * rides in as the single leading clause so `composeLayers` still owns the
 * NO_TEXT-at-both-ends rule that `prompt.test.ts` asserts.
 *
 * Two things happen here that used not to: the base is run through
 * `sanitizeComposed` (a table-edited prompt is free text that becomes the
 * whole prompt, so it is capped and stripped of control characters), and
 * the house negative is appended. Every submit path goes through this one
 * function, so neither guard can be skipped by a caller.
 */
export function composeZonePrompt(base: string, zone: ZoneRef, negative?: string): string {
	const clean = sanitizeComposed(base);
	// The frame is the first clause of every composed base. When it is still
	// there (the table did not rewrite the opening), the zone's moment goes
	// straight after it, ahead of the window and the materials. A base the
	// table rewrote from the first word keeps its own order, moment after.
	const head = clean.startsWith(FRAME_HEAD) ? clean.indexOf('. ') : -1;
	const frame = head > 0 ? clean.slice(0, head) : clean;
	const rest = head > 0 ? clean.slice(head + 2) : '';
	// A phrase the base already carries (the room-participates clause and a
	// q5c:and reply both say "no device anywhere") is dropped from the moment.
	const moment = zone.renderSuffix
		.split(', ')
		.filter((seg) => !rest.includes(seg))
		.join(', ');
	return composeLayers({ mood: frame, materialsAndLight: rest, programme: '', feel: '' }, { ...zone, renderSuffix: moment }, negative);
}

/** Words in a submitted prompt — the recipe's 90–130 target, and the test's 160 ceiling. */
export function wordCount(prompt: string): number {
	return prompt.split(/\s+/).filter(Boolean).length;
}

export { ERA_SCALE };
