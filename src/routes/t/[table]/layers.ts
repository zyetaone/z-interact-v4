/**
 * THE LAYER BUILDER — the last content wiring named in CLAUDE.md's "What's
 * still open": turning a table's stored answers into `prompt.ts`'s four
 * `LayerInputs` plus the negative prompt.
 *
 * Pure. No D1, no `$app/server`, no fetch — `layers.test.ts` drives it with
 * fixed answers and asserts the exact layer strings.
 *
 * Mapping, re-derived for VERSION 3 of the questions (`game/questions.ts`).
 * These are the TOP-LEVEL table-wide layers (the screen 15 textarea) — Q4,
 * Q5 and Q8 are deliberately NOT pulled in here even though they're
 * answered: they feed the per-zone `renderSuffix` instead (`zones.ts`'s
 * `library`/`garden`), which is the more specific place their content
 * belongs. `resolveZone` below reads them from the raw answers directly.
 *
 *   mood             <- the fixed house base (a workplace interior in
 *                       <year>, photoreal, wide establishing view — see
 *                       `prompt.ts`'s `houseBase`), THEN the chosen future
 *                       as "seen through the lens of <future>: <moodLine>",
 *                       plus Q1's era fragment when the table nudged the
 *                       chip off the future's default, plus Q1's push
 *                       reply verbatim. `<year>` comes from the era chip
 *                       (the q1 answer), not a hardcoded 2035, so a nudge
 *                       shows up in the house base too.
 *   materialsAndLight<- q2's option fragment + its push reply verbatim,
 *                       then q7's material-adjacent option fragments (walls
 *                       that become screens, writable glass, ambient light,
 *                       sensing, analogue zones — all read as material/light
 *                       qualities now that Q7 absorbed the old sensing Q9)
 *   programme        <- q3, q6 fragments, THEN a dedicated "centaur room"
 *                       clause built from q9's facets (including its
 *                       `refused-to-automate` open capture), THEN a
 *                       dedicated "agile" clause built from q10's chosen
 *                       principle, THEN q10's push reply verbatim (the
 *                       "hardest" one the table named) — plus q12 (urban
 *                       edge / ground plane) ONLY when
 *                       `ENABLE_PROPOSED_QUESTIONS` (game/config.ts) is on
 *   feel             <- q11's three picks
 *   wildcard         <- verbatim, never rewritten
 *   negative         <- the house terms + the future's own `negativeFragment`
 *
 * **One prompt row per table, not per zone.** `composeBase` is the
 * table-level text screen 15 puts in the editable textarea. The per-zone
 * string actually submitted to fal is `composeZonePrompt`, which wraps that
 * base in `prompt.ts`'s NO_TEXT guards and appends the zone's own suffix
 * with its `{qN}` placeholders resolved. That keeps one composer for both
 * the edited and the unedited case: an edit replaces the base, and the
 * guards and suffix are re-applied identically either way.
 */
import { QUESTIONS, WILDCARD, type Question, type QuestionOption } from '$lib/game/questions';
import { FUTURES, HOUSE_NEGATIVE, type Future } from '$lib/game/futures';
import { ERA_SCALE, type Era } from '$lib/game/era';
import { ENABLE_PROPOSED_QUESTIONS } from '$lib/game/config';
import type { Zone } from '$lib/game/zones';
import { composeLayers, houseBase, sanitizeComposed, type LayerInputs, type ZoneRef } from '$lib/server/prompt';

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

export const QUESTION_BY_ID: ReadonlyMap<string, Question> = new Map(QUESTIONS.map((q) => [q.id, q]));

const MATERIAL_IDS = ['q2', 'q7'] as const;
const PROGRAMME_IDS = ['q3', 'q6'] as const;

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
	const q = QUESTION_BY_ID.get(answer.questionId);
	if (!q) return [];
	const chosen = new Set(answer.keys);
	return q.options.filter((o) => chosen.has(o.key)).map((o) => fragmentOf(o, answer.text?.[o.key]));
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

/** The house terms first, then the future's own ten; duplicates dropped, order preserved. */
export function composeNegative(futureNegative: string | undefined): string {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const term of `${HOUSE_NEGATIVE}, ${futureNegative ?? ''}`.split(',')) {
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
	const q1 = QUESTION_BY_ID.get('q1');

	// --- mood: the fixed house base, THEN the future seen through its
	// lens, the era only when it was nudged, then 3c.
	const eraAnswer = by.get('q1');
	const era = input.era ?? ((eraAnswer?.keys[0] as Era | undefined) ?? future?.eraDefault ?? null);
	const eraNudged = !!era && !!future && era !== future.eraDefault;
	const eraFragment =
		era && (eraNudged || !future)
			? q1?.options.find((o) => o.key === era)?.promptFragment
			: undefined;
	const base = houseBase(ERA_YEAR[era ?? 'recognisably-2035']);
	const lens = future
		? `seen through the lens of ${future.name}: ${future.moodLine.replace(/\.$/, '')}`
		: HOUSE_REGISTER;
	const mood = joinClauses([base, lens, eraFragment, eraAnswer?.pushReply]);

	// --- materials & light: q2 fragment + its push reply, then q7's
	// material-adjacent fragments (technology read as surface/light quality).
	const materialsAndLight = joinClauses([
		...fragmentsFor(by.get('q2')),
		by.get('q2')?.pushReply,
		...fragmentsFor(by.get('q7'))
	]);

	// --- programme: q3, q6 fragments, then a dedicated centaur-room clause
	// from q9's facets, then a dedicated agile clause from q10's chosen
	// principle, then q10's push reply (the "hardest" one), plus q12 (urban
	// edge / ground plane) when the proposed-question flag is on.
	const centaurFragments = fragmentsFor(by.get('q9'));
	const centaurClause = centaurFragments.length
		? `the centaur room where humans and AI work as one unit: ${centaurFragments.join(', ')}`
		: undefined;
	const agileFragments = fragmentsFor(by.get('q10'));
	const agileClause = agileFragments.length ? `this workplace's agility: ${agileFragments.join(', ')}` : undefined;

	const programmeIds = ENABLE_PROPOSED_QUESTIONS ? [...PROGRAMME_IDS, 'q12'] : PROGRAMME_IDS;
	const programmeParts: (string | undefined)[] = [
		...programmeIds.flatMap((id) => fragmentsFor(by.get(id))),
		centaurClause,
		agileClause,
		by.get('q10')?.pushReply
	];
	const programme = joinClauses(programmeParts);

	// --- feel: q11's three picks, a comma list rather than sentences.
	const feel = fragmentsFor(by.get('q11')).join(', ');

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

/** Fills a zone's `{qN}` placeholders from the table's answers. */
export function resolveZone(zone: Zone, answers: readonly AnswerLike[]): ZoneRef {
	const by = answerMap(answers);
	const renderSuffix = zone.renderSuffix.replace(/\{(q\d+)\}/g, (_m, id: string) => {
		const fragments = fragmentsFor(by.get(id));
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
