/**
 * THE LAYER BUILDER — turning a table's stored answers into `prompt.ts`'s
 * four `LayerInputs` plus the negative prompt.
 *
 * Pure. No D1, no `$app/server`, no fetch — `layers.test.ts` drives it with
 * fixed answers and asserts the exact layer strings.
 *
 * Mapping, re-derived for VERSION 4 of the questions (`game/questions.ts`).
 * These are the TOP-LEVEL table-wide layers (the screen 15 textarea) — the
 * zone-worthy questions (q3 arrival, q4w workstation, q5c centaur deep
 * work, q6r recharge) are deliberately NOT pulled in here even though
 * they're answered: they feed the per-zone `renderSuffix` instead
 * (`zones.ts`), which is the more specific place their content belongs.
 * `resolveZone` below reads them from the raw answers directly.
 *
 *   mood             <- the fixed house base (a workplace interior in
 *                       <year>, photoreal, wide establishing view — see
 *                       `prompt.ts`'s `houseBase`), THEN the chosen future
 *                       as "seen through the lens of <future>: <moodLine>",
 *                       plus `era.ts`'s fragment when the table nudged the
 *                       chip off the future's default (V4 has no era
 *                       question; the chip's row still stores under `q1`).
 *                       `<year>` comes from the era chip, not a hardcoded
 *                       2035, so a nudge shows up in the house base too.
 *   materialsAndLight<- q2's option fragment, its "And: what scale?" pick,
 *                       its push reply verbatim (the two materials), then
 *                       q7 (technology) and q8 (nature) — both reach every
 *                       zone, because the base is prepended to all four
 *   programme        <- q3, q4w, q5c, q6r fragments, MINUS whatever a zone
 *                       already owns (all four, under the `book` set), THEN
 *                       q5c's push reply verbatim (what the table refused
 *                       to automate) — plus q12 (urban edge / ground plane)
 *                       ONLY when `ENABLE_PROPOSED_QUESTIONS` is on
 *   feel             <- q10's chosen strength, its "And: which was hardest?"
 *                       pick, then q11's three picks — a comma list
 *   wildcard         <- verbatim, never rewritten
 *   negative         <- the house terms + the future's own `negativeFragment`
 *
 * An "And:" sub-question's pick is stored under `<qid>:and` (`andId`) and
 * always rides with its parent: `fragmentsWithAnd` is the one place that
 * pairs them, for the base layers and for a zone's `{qN}` alike.
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
import { ERA_FRAGMENT, ERA_SCALE, type Era } from '$lib/game/era';
import { ENABLE_PROPOSED_QUESTIONS } from '$lib/game/config';
import { ZONES, type Zone } from '$lib/game/zones';
import { NO_COLLAGE, composeLayers, houseBase, sanitizeComposed, type LayerInputs, type ZoneRef } from '$lib/server/prompt';

/** The house base's year label per era chip value — the frame line reads the
 *  table's actual era chip, so a nudge toward 2040 (or back to 1930s) shows
 *  up in the opening line too, not just in the mood clause after it. */
const ERA_YEAR: Record<Era, string> = {
    'retro-1930s': 'the 1930s, reborn',
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
}

export interface BuiltLayers extends LayerInputs {
	/** The future's terms behind the house terms. Stored on the prompt row, sent alongside. */
	negative: string;
}

/** Used when a table skips the future card (game-flow §1 screen 3's failure state). */
export const HOUSE_REGISTER =
	'A working office interior at the last warm hour, moody rather than stark; deep ground, pooled warm light, shadow held deliberately. Distant anonymous figures, never a posed face.';

export const QUESTION_BY_ID: ReadonlyMap<string, Question> = new Map(ACTIVE_QUESTIONS.map((q) => [q.id, q]));

/** Every answer id that carries option fragments: each question, plus `<qid>:and` for its sub-question. */
const OPTIONS_BY_ID: ReadonlyMap<string, readonly QuestionOption[]> = new Map([
	...ACTIVE_QUESTIONS.map((q) => [q.id, q.options] as const),
	...ACTIVE_QUESTIONS.filter((q) => q.and).map((q) => [andId(q.id), q.and!.options] as const)
]);

/** Which V4 question feeds which table-level layer. Exported so a test can prove no question is orphaned. */
export const MATERIAL_IDS = ['q2', 'q7', 'q8'] as const;
export const PROGRAMME_IDS = ['q3', 'q4w', 'q5c', 'q6r'] as const;
export const FEEL_IDS = ['q10', 'q11'] as const;

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

/** The layout guard first, then the house terms, then the future's own; duplicates dropped, order preserved. */
export function composeNegative(futureNegative: string | undefined): string {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const term of `${NO_COLLAGE}, ${HOUSE_NEGATIVE}, ${futureNegative ?? ''}`.split(',')) {
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

	// --- mood: the fixed house base, THEN the future seen through its
	// lens, the era only when it was nudged, then 3c.
	const eraAnswer = by.get('q1');
	const era = input.era ?? ((eraAnswer?.keys[0] as Era | undefined) ?? future?.eraDefault ?? null);
	const eraNudged = !!era && !!future && era !== future.eraDefault;
	const eraFragment = era && (eraNudged || !future) ? ERA_FRAGMENT[era] : undefined;
	const base = houseBase(ERA_YEAR[era ?? 'recognisably-2035']);
	const lens = future
		? `seen through the lens of ${future.name}: ${future.moodLine.replace(/\.$/, '')}`
		: HOUSE_REGISTER;
	const mood = joinClauses([base, lens, eraFragment, eraAnswer?.pushReply]);

	// --- materials & light: q2 + its scale pick + its push reply, then q7
	// (technology) and q8 (nature) — read as surface/light qualities, and
	// carried into every zone through the base.
	const materialsAndLight = joinClauses([
		...fragmentsWithAnd(by, 'q2'),
		by.get('q2')?.pushReply,
		...fragmentsWithAnd(by, 'q7'),
		...fragmentsWithAnd(by, 'q8')
	]);

	// --- programme: the zone-worthy questions MINUS what a zone owns, then
	// q5c's push reply (what the table refused to automate), plus q12 (urban
	// edge / ground plane) when the proposed-question flag is on.
	//
	// PER-ZONE CAP: anything a zone's own suffix resolves is dropped here, so
	// each zone's prompt carries its own programme once instead of the whole
	// room's, four times over. With the `book` zone set that leaves the base
	// programme empty but for the table's own sentence, which is correct —
	// the deep-work room belongs in the library and arrival belongs in the
	// plaza; saying both in all four is what invited a board.
	const programmeIds = (ENABLE_PROPOSED_QUESTIONS ? [...PROGRAMME_IDS, 'q12'] : [...PROGRAMME_IDS]).filter(
		(id) => !ZONE_OWNED_IDS.has(id)
	);
	const programme = joinClauses([...programmeIds.flatMap((id) => fragmentsWithAnd(by, id)), by.get('q5c')?.pushReply]);

	// --- feel: q10's strength and its "hardest" pick, then q11's three
	// picks — a comma list rather than sentences.
	const feel = FEEL_IDS.flatMap((id) => fragmentsWithAnd(by, id)).join(', ');

	// --- wildcard: verbatim, through its own `{text}` slot.
	const wildcardAnswer = by.get(WILDCARD.id);
	const wildcardText = wildcardAnswer?.text?.[WILDCARD.options[0].key]?.trim();
	const wildcard = wildcardText ? fragmentOf(WILDCARD.options[0], wildcardText) : undefined;

	return { mood, materialsAndLight, programme, feel, wildcard, negative: composeNegative(future?.negativeFragment) };
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
	return composeLayers(
		{ mood: sanitizeComposed(base), materialsAndLight: '', programme: '', feel: '' },
		zone,
		negative
	);
}

export { ERA_SCALE };
