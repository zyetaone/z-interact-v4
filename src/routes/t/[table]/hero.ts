/**
 * THE HERO PROMPT — one main workspace image per table.
 *
 * Different in kind from the four zone prompts, not a fifth of them. A zone
 * prompt names one room, one camera and one act, and four of them are four
 * independent renders of one world. This asks for the WHOLE workplace in a
 * single elevated three-quarter view, and it is written as a production
 * designer's brief — "design a workplace that is relevant in 2040 for a
 * team that chose the dense and lit city" — so the model designs from the
 * table's selections rather than obeying a list of them. The decision it
 * serves: the question owner reads four pictures per table as four
 * unrelated ideas; one picture is the table's answer, and the narrative
 * paragraph underneath is how it follows from what they chose.
 *
 * NO NEW FRAGMENT LOGIC LIVES HERE. Every answer reaches this prompt
 * through `layers.ts`'s own readers — `fragmentsWithAnd`, `fragmentsFor`,
 * `ROOM_PARTICIPATES`, `ERA_YEAR`, `composeNegative` — so a fragment that
 * changes in the question set changes here and in the zone prompts
 * together. This file owns the ORDER and the sentences around them, nothing
 * about what an answer means.
 *
 * It sits beside `layers.ts` rather than next to `server/prompt.ts` for one
 * reason: `prompt.ts` is deliberately content-free (it does not know what a
 * future or a zone is) and `layers.ts` — which knows both — lives here. A
 * `server/hero.ts` would have had to import upward out of `routes/`, which
 * nothing in this repo does.
 *
 * `no text` sits at both ends, the same rule `composeLayers` holds for the
 * zone prompts: once inside the opening frame sentence, once as the last
 * thing the model reads.
 */
import { NO_TEXT, EXPOSURE, UNDEREXPOSED_NEGATIVE, DARK_FEEL_KEYS, sanitizeComposed, wantsBrightExposure } from '$lib/server/prompt';
import { impossibleIdea, vantageFor } from '$lib/game/zones';
import type { Era } from '$lib/game/era';
import type { Zone } from '$lib/game/zones';
import {
	answerMap,
	composeNegative,
	composeZonePrompt,
	resolveZone,
	ERA_YEAR,
	fragmentsFor,
	fragmentsWithAnd,
	futureByKey,
	HOUSE_LIGHT,
	HOUSE_REGISTER,
	ROOM_PARTICIPATES,
	wildcardFragment,
	steerFragment,
	FREE_TEXT_MAX,
	type AnswerLike,
	type LayerBuildInput
} from './layers';

/**
 * THE BRIEF ASKED FOR 150–190 WORDS AND THIS TEMPLATE CANNOT REACH IT.
 * Measured, not estimated: a fully answered table composes 288–301 words
 * across the six lenses and all twenty tables (the scratch sample is 296).
 * A table whose feel words asked for the dark is ~9 shorter, since it does
 * not carry the exposure clause. SINGLE_FRAME and its four Avoid terms add
 * ~27 more, which is why the regression ceiling moved 310 -> 340: six of
 * twenty images on the first full run came back as multi-panel collages,
 * and a shorter prompt that produces a contact sheet is not the cheaper
 * outcome. The arithmetic, so the next reader does
 * not re-derive it:
 *
 *   ~137 words are ANSWER FRAGMENTS, arriving verbatim from `layers.ts` —
 *   the four acts with their "And:" picks, q7's room-participates clause,
 *   q8, q10, q2 with its scale pick, q11's three feel words.
 *   ~152 words are the template's own scaffolding — the design brief
 *   sentence, the three-quarter-view frame with this table's own vantage
 *   and its exposure,
 *   styleDna + insideCue + the impossible idea, the four verb lead-ins, the
 *   people line, and the Avoid list including the no-signage terms the first
 *   render earned.
 *
 * Getting to 190 means cutting ~70, and there is nothing to cut that is not
 * either an answer (the brief requires every answer key to reach the
 * prompt) or a mandated line of the template. Paraphrasing the fragments
 * shorter would mean a second copy of the fragment logic, which the brief
 * forbids for the better reason that the two copies drift.
 *
 * So `max` here is the measured ceiling plus a small margin, and the test
 * against it is a REGRESSION guard — it catches a fragment set that grows
 * unnoticed — not evidence the 150–190 target was met. It was not. Raising
 * it silently would have hidden that; this is the lead's call to make.
 *
 * RE-MEASURED 21 Sep, after the question cut and after the wildcard was
 * added to this prompt: 310–324 words across all six lenses and all twenty
 * tables, with BOTH free-text fields full (a 140-character wildcard and a
 * q2 push reply). 1,898–1,973 characters. Still under 340, so the ceiling
 * did not move — but the margin is now ~16 words, and the next fragment
 * added here will need this number re-measured rather than assumed.
 */
export const HERO_WORD_TARGET = { min: 150, max: 340, briefAsked: { min: 150, max: 190 } } as const;

/**
 * What an elevated view of a whole building invites that one room does not:
 * writing on it. Added after the first table-10 render came back with the
 * prompt's own section labels painted on the walls.
 */
export const NO_SIGNAGE_TEXT = 'no signage text, no wayfinding words, no captions';

/**
 * THE WALL CAME BACK AS CONTACT SHEETS.
 *
 * Measured on the first full twenty-table run against production: six of
 * twenty images were multi-panel collages — a big frame with three or four
 * inset photographs beside it — rather than one photograph of one building.
 * The Avoid list already said "collage, grid, split screen" and had said so
 * since the recipe was written. A negative did not stop it, which is the
 * ordinary way negatives behave: they bias, they do not forbid.
 *
 * The cause is in the positive half. The prompt asks for four separate acts
 * — arriving, deep work, the stations, recharging — and the most obvious way
 * to show four things at once is four panels. So the fix is to say what the
 * frame IS, once more, immediately after the acts and in the same voice,
 * rather than to add another word to the Avoid list.
 */
export const SINGLE_FRAME =
	'All of this in one single photograph of one continuous space, seen from one camera at one moment — never panels, insets or a divided frame';

/**
 * The brightening lives in `$lib/server/prompt` now, because the four ZONE
 * renders need the same clause the hero does — that is where the owner's
 * "not dark" complaint actually lands, four frames per table against the
 * hero's one. Re-exported here unchanged: this file is still where the
 * reasoning and the measurements are written down.
 */
export { EXPOSURE, UNDEREXPOSED_NEGATIVE, DARK_FEEL_KEYS, wantsBrightExposure };


/** Drops empties, trims trailing punctuation, joins as sentences — `layers.ts`'s `joinClauses`, which is private there. */
function sentences(parts: readonly (string | undefined)[]): string {
	return parts
		.map((p) => (p ?? '').trim().replace(/[.\s]+$/, ''))
		.filter((p) => p.length > 0)
		.join('. ');
}

/** `a, b` from a question's fragments, or undefined when the table left it blank. */
function clause(fragments: readonly string[]): string | undefined {
	const joined = fragments.filter((f) => f.trim().length > 0).join(', ');
	return joined.length > 0 ? joined : undefined;
}

/**
 * ONE ACT AS PROSE — a verb-led sentence, never `Label: value`.
 *
 * The first render of this prompt (table 10, 20 Sep) put the literal words
 * "Arrival", "Deep work", "Stations" and "Recharge" on the walls of the
 * building as signage. A colon-label reads to an image model as a caption
 * to draw, not as a section heading to obey — which is the same reason
 * `NO_TEXT` sits at both ends.
 *
 * The lead-in is deliberately neutral about WHAT the table chose: "there
 * are no fixed desks" would contradict a table that chose the cockpit, so
 * the verb carries the grammar and the fragment carries the content.
 *
 * Omitted entirely when the table never answered, rather than leaving a
 * verb with nothing after it.
 */
function act(leadIn: string, fragments: readonly string[]): string | undefined {
	const body = clause(fragments);
	return body ? `${leadIn} ${body}` : undefined;
}

export function composeHeroPrompt(input: LayerBuildInput): string {
	const by = answerMap(input.answers);
	const future = futureByKey(input.futureKey);

	// The era chip decides the year, exactly as it does for the zone prompts
	// — the same `ERA_YEAR` table, so a nudge to 2040 moves both.
	const eraAnswer = by.get('q1');
	const era = input.era ?? ((eraAnswer?.keys[0] as Era | undefined) ?? future?.eraDefault ?? null);
	const year = ERA_YEAR[era ?? 'recognisably-2035'];

	// THE LENS BY ITS PLAIN NAME, never its key: "the dense and lit city",
	// not "neo-seoul". The name is the owner's own words and reads as a
	// description to the model; the key is an internal slug that reads as a
	// place. `moodLine` is not used here at all — it carries night, rain and
	// an hour of the day, and a lens has to survive daylight (futures.ts).
	const lens = future ? `for a team that chose ${future.name.replace(/^The /, 'the ')}` : '';
	const window = future ? future.worldOutside : HOUSE_REGISTER;

	// THE VANTAGE IS PER TABLE. Two tables with the same lens and the same
	// answers used to compose the same prompt to the character, so the wall
	// showed one building twice and there was nothing for a judge to weigh.
	// Still an elevated three-quarter view every time — the frame the brief
	// fixed — but each table looks at its own building from its own corner.
	const vantage = vantageFor(input.table);
	// The exposure rides in the frame, next to the other camera terms, rather
	// than at the end with the feel words: a model weights the opening of a
	// prompt, and "volumetric daylight" alone was losing to a stack of dark
	// surfaces further down.
	// q11 is cut, so there is no feel word left to opt out of the
	// brightening. `wantsBrightExposure` is still the one place that decides
	// it — called with no keys, which is the "nothing asked for the dark"
	// case it already had.
	const bright = wantsBrightExposure([]);
	const exposure = bright ? `, ${EXPOSURE}` : '';
	const frame = sentences([
		`Design a workplace that is relevant in ${year}${lens ? ` ${lens}` : ''}: ${window}`,
		`Show the whole workspace in one elevated three-quarter view ${vantage}, one continuous building, as a film still: anamorphic, volumetric daylight, haze${exposure}, no logos, ${NO_TEXT}`
	]);

	// The lens's own signatures, its indoor cue, and the table's one
	// impossible idea — the same three `layers.ts` composes into the base,
	// so the hero and any zone render of the same table agree about the world.
	const world = sentences([future?.styleDna, future?.insideCue, impossibleIdea(future?.key, input.table)]);

	// The surviving answers as ACTS inside one building, each keeping its
	// "And:" pick. The 21 Sep minutes cut q3 (arrival), q4w (workstation,
	// merged into q5c), q7 (technology) and q10 (brilliant at one): two acts
	// where there were four, plus nature as a clause.
	//
	// q7's clauses are still composed when a row HAS a q7 answer. A table
	// that answered under V4 and is regenerated now should read as it read
	// then; a table answering today simply has no q7 key and contributes
	// nothing here.
	const roomParticipates = (by.get('q7')?.keys ?? []).map((k) => ROOM_PARTICIPATES[k]).filter(Boolean);
	const programme = sentences([
		act('Deep work happens as', fragmentsWithAnd(by, 'q5c')),
		act('They recharge in', fragmentsWithAnd(by, 'q6r')),
		...roomParticipates,
		clause(fragmentsFor(by.get('q8')))
	]);

	// Materials and the scale pick read as one clause — the scale IS the
	// camera ("wide lens, high ceilings, open floor"), which is why it sits
	// with the materials and not with the acts. q2's push reply is the two
	// materials the table asked for in their own words; it reaches the zone
	// prompts today and reaches this one the same way.
	// q2's push reply is the OTHER free text on this path, and the same rule
	// applies: the base path sanitizes the whole composed string and this
	// one does not, so the two composers could otherwise carry the same
	// typed words differently.
	const materials = clause([...fragmentsFor(by.get('q2')), sanitizeComposed(by.get('q2')?.pushReply ?? '', FREE_TEXT_MAX)]);
	const scale = clause(fragmentsFor(by.get('q2:and')));
	// The feel is the LENS's now, not q11's — see `futures.ts`'s `lightLine`.
	// Same source as the zone prompts use, so a table's hero and its zones
	// cannot describe two different times of day.
	const feel = future?.lightLine ?? HOUSE_LIGHT;
	const dressing = sentences([
		[materials, scale].filter(Boolean).join('; '),
		feel,
		'People small and anonymous, mid-task, two to six of them'
	]);

	// THE WILDCARD, and the reason it is here at all: it was NOT.
	//
	// `composeBase` (the four-zone path) has carried it since the recipe was
	// written. This composer never read it — and under `ZONE_SET=hero`, the
	// default, this composer IS the only prompt the room renders. So the
	// last screen every table sees asked "what have we missed?", promised
	// "it goes into the drawing exactly as you write it", and then the
	// answer reached D1, the review screen, the desk and the export, and
	// never the picture. Found in the 21 Sep end-to-end review.
	//
	// It sits LAST of the content, immediately before the Avoid list, which
	// is the position `composeBase` gives it too: the table's own words are
	// the final thing the model reads about what to draw.
	const wildcard = wildcardFragment(by);
	// ...and the steer after it: "change one thing", typed while looking at
	// the render the rest of this prompt produced. Most recent last.
	const steer = steerFragment(by);

	// One negative list, built by `layers.ts` — house terms, the 2026 tells,
	// the lens's own, and the anti-board terms, deduped in that order. Not
	// re-typed here: two lists that drift is how a guard stops guarding.
	const paperChosen = !!by.get('q7')?.keys.includes('paper-and-pens');
	// The hero's own extra terms, on top of the shared list. They are here
	// rather than in `composeNegative` because that list is also every zone
	// prompt's, and this is the hero's own lesson: an elevated view of a
	// whole building gives a model far more wall to write on than one room
	// does, and the first render used it.
	const avoid = `Avoid: ${composeNegative(future?.negativeFragment, paperChosen)}, ${NO_SIGNAGE_TEXT}${bright ? `, ${UNDEREXPOSED_NEGATIVE}` : ''}, panels, insets, a contact sheet, a divided frame`;

	// SINGLE_FRAME sits immediately after the acts, which are what invite a
	// split frame in the first place, and before the dressing.
	return sentences([frame, world, programme, SINGLE_FRAME, dressing, wildcard, steer, avoid, NO_TEXT]);
}

/* -------------------------------------------------------------------------- */
/* THE ONE CHOOSER every submit path calls                                    */
/* -------------------------------------------------------------------------- */

export interface ZonePromptContext {
	/** The stored `prompt` row's composed base — the table-level text screen 15 edits. */
	composed: string;
	negative: string;
	answers: readonly AnswerLike[];
	futureKey?: string | null;
	era?: Era | null;
	table: number;
}

/**
 * Which composer a zone gets. There are five submit paths — the phone's
 * queue, its poll ticker, its per-zone retry, the desk's tick slice and the
 * desk's regenerate — and every one of them has to make the same choice, or
 * a row drawn by one is drawn from a different prompt than the same row
 * drawn by another. That bug is already in this repo's history
 * (`admin.remote.ts`'s note: the desk submitted `prompt.composed` bare).
 * So the choice lives here, once.
 *
 * KNOWN, AND NOT A SLIP: the hero composes from the ANSWERS, so a table
 * that rewrote the prompt on screen 15 does not change its hero render.
 * Under `ZONE_SET=four`/`all` the edit still governs the four zones. The
 * hero is a design brief built from what was chosen, not a text field, and
 * splicing a free-text rewrite into it would mean the model reading two
 * briefs at once. Whether screen 15 should still offer the textarea in a
 * hero-only room is a product call, flagged rather than taken here.
 */
export function composePromptFor(zone: Zone, ctx: ZonePromptContext): string {
	if (zone.hero) {
		return composeHeroPrompt({ futureKey: ctx.futureKey, era: ctx.era, answers: ctx.answers, table: ctx.table });
	}
	return composeZonePrompt(ctx.composed, resolveZone(zone, ctx.answers), ctx.negative);
}
