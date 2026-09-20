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
import { NO_TEXT } from '$lib/server/prompt';
import { impossibleIdea } from '$lib/game/zones';
import type { Era } from '$lib/game/era';
import {
	answerMap,
	composeNegative,
	ERA_YEAR,
	fragmentsFor,
	fragmentsWithAnd,
	futureByKey,
	HOUSE_REGISTER,
	ROOM_PARTICIPATES,
	type AnswerLike,
	type LayerBuildInput
} from './layers';

/**
 * THE BRIEF ASKED FOR 150–190 WORDS AND THIS TEMPLATE CANNOT REACH IT.
 * Measured, not estimated: a fully answered table composes 257–262 words
 * across the six lenses (the scratch sample is 260). The arithmetic, so the
 * next reader does not re-derive it:
 *
 *   ~137 words are ANSWER FRAGMENTS, arriving verbatim from `layers.ts` —
 *   the four acts with their "And:" picks, q7's room-participates clause,
 *   q8, q10, q2 with its scale pick, q11's three feel words.
 *   ~120 words are the template's own scaffolding — the design brief
 *   sentence, the three-quarter-view frame, styleDna + insideCue + the
 *   impossible idea, the people line, and the Avoid list.
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
 */
export const HERO_WORD_TARGET = { min: 150, max: 270, briefAsked: { min: 150, max: 190 } } as const;

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

/** `Arrival: …` — omitted entirely when the table never answered, rather than printing a label with nothing after it. */
function act(label: string, fragments: readonly string[]): string | undefined {
	const body = clause(fragments);
	return body ? `${label}: ${body}` : undefined;
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

	const frame = sentences([
		`Design a workplace that is relevant in ${year}${lens ? ` ${lens}` : ''}: ${window}`,
		`Show the whole workspace in one elevated three-quarter view, one continuous building, as a film still: anamorphic, volumetric daylight, haze, no logos, ${NO_TEXT}`
	]);

	// The lens's own signatures, its indoor cue, and the table's one
	// impossible idea — the same three `layers.ts` composes into the base,
	// so the hero and any zone render of the same table agree about the world.
	const world = sentences([future?.styleDna, future?.insideCue, impossibleIdea(future?.key, input.table)]);

	// The four zone-worthy answers as ACTS inside one building, each keeping
	// its "And:" pick, plus the room participating (q7), nature (q8) and
	// q10's one visible consequence. q10's own "And:" is `WALL_ONLY_IDS` —
	// a sentence about the table, never a subject — hence `fragmentsFor`.
	const roomParticipates = (by.get('q7')?.keys ?? []).map((k) => ROOM_PARTICIPATES[k]).filter(Boolean);
	const programme = sentences([
		act('Arrival', fragmentsWithAnd(by, 'q3')),
		act('Deep work', fragmentsWithAnd(by, 'q5c')),
		act('Stations', fragmentsWithAnd(by, 'q4w')),
		act('Recharge', fragmentsWithAnd(by, 'q6r')),
		...roomParticipates,
		clause(fragmentsFor(by.get('q8'))),
		clause(fragmentsFor(by.get('q10')))
	]);

	// Materials and the scale pick read as one clause — the scale IS the
	// camera ("wide lens, high ceilings, open floor"), which is why it sits
	// with the materials and not with the acts. q2's push reply is the two
	// materials the table asked for in their own words; it reaches the zone
	// prompts today and reaches this one the same way.
	const materials = clause([...fragmentsFor(by.get('q2')), by.get('q2')?.pushReply ?? '']);
	const scale = clause(fragmentsFor(by.get('q2:and')));
	const feel = clause(fragmentsFor(by.get('q11')));
	const dressing = sentences([
		[materials, scale].filter(Boolean).join('; '),
		feel,
		'People small and anonymous, mid-task, two to six of them'
	]);

	// One negative list, built by `layers.ts` — house terms, the 2026 tells,
	// the lens's own, and the anti-board terms, deduped in that order. Not
	// re-typed here: two lists that drift is how a guard stops guarding.
	const paperChosen = !!by.get('q7')?.keys.includes('paper-and-pens');
	const avoid = `Avoid: ${composeNegative(future?.negativeFragment, paperChosen)}`;

	return sentences([frame, world, programme, dressing, avoid, NO_TEXT]);
}
