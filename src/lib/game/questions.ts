/**
 * QUESTION SET — VERSION 4 (BRIEF.md §"The questions — VERSION 4", the
 * question owner's 19 Sep 17:58 send, which supersedes the 18 Sep 21:45
 * V3 set this file previously carried). Every `prompt`, `lead`, option
 * `label`, `push` line, "And:" sub-question and wildcard is copied exactly;
 * the ◆ flags are `diamond: boolean` (now Q2, Q4, Q5, Q6, Q9 — five).
 *
 * Her Q1 ("Choose your lens") is the lens screen — `futures.ts` — and her
 * era cue is the chip there (`era.ts`), so this array opens at her Q2.
 *
 * Ids are STABLE and never renumbered (they are the D1 `answers.question_id`;
 * renumbering orphans saved rows). Where a V4 question is a V3 question
 * survived, it keeps its id; a new question gets a new id:
 *
 *   V4 Q2 material   -> q2   (kept)      V4 Q6 recharge      -> q6r  (new)
 *   V4 Q3 arrival    -> q3   (kept)      V4 Q7 technology    -> q7   (kept)
 *   V4 Q4 workstation-> q4w  (new)       V4 Q8 nature        -> q8   (kept)
 *   V4 Q5 centaur    -> q5c  (new)       V4 Q9 brilliant-at-one -> q10 (kept)
 *                                        V4 Q10 three words  -> q11  (kept)
 *   retired: q1 (era question; the id survives only as the era chip's row),
 *   q4 (hardest thinking), q5 (protects/restores), q6 (sit/meet), q9 (centaurs).
 *
 * The "And:" sub-questions (Q2 scale, Q3 when it knows you're coming, Q4
 * how much it knows about you, Q5 where the AI sits, Q6 how far it goes,
 * Q9 which was hardest) are `and`: a single-select chip row under the
 * options, optional, stored as its own answer row under `${id}:and`. Q9's
 * chips are her "A · B · C · D" as each option's leading phrase (the
 * options are not lettered on screen) — the one label not verbatim.
 *
 * `promptFragment`s are the one thing here not in her words: a concrete,
 * drawable, lens-neutral phrase per option, written from her option text
 * in prompt-recipe.md's register — subjects and materials, never
 * instructions (Q2 is her tone; materials; finish table as she wrote it).
 * Recipe v2 (after the first 20-table wall read as 2026 offices with
 * plants): the zone-owned fragments (q3, q4w, q5c, q6r) are WORK ACTS —
 * people mid-action with the arrangement the option describes — and every
 * invisible-technology answer (q7, q4w's "how much it knows", q10) names
 * a visible EFFECT, never an absence.
 * Three "And:" rows are CAMERA clauses rather than subjects (§2, move 4):
 * Q2 scale → lens and height, Q6 immersion → how much of the frame the
 * biome takes, Q4 how-much-it-knows → tech visibility. Q10's feel words
 * are LIGHT AND WEATHER clauses, not adjectives (§2, move 5). `open`
 * options are gone in V4 — every option is a fixed choice — so no fragment
 * carries `{text}` except the wildcard's.
 *
 * Push lines: `push` is her "PUSH —" line verbatim, spoken at the table.
 * Two double as a typed capture field (`pushCapturesReply`): Q2's "name two
 * materials" (as in V3, and drawn) and Q5's "what did your table refuse to
 * automate?" (V3 captured that through an `open` facet; V4 makes it the
 * push line, so the capture moves with it — kept for the wall, never
 * drawn: `pushNotDrawn`). The rest are spoken only.
 *
 * Fixed interface the plumbing builds against (routes, `answers.remote.ts`,
 * `prompt.ts`'s programme layer): an ordered `QUESTIONS` array, each with a
 * stable `id` and options, plus an optional free-text wildcard question.
 */

import { ENABLE_PROPOSED_QUESTIONS } from './config';

export const TABLE_COUNT = 20;

/** How a question is answered — mirrors the brief's own wording, not an invented scale. */
export type SelectKind = { kind: 'one' } | { kind: 'many'; min?: number; max?: number } | { kind: 'pick'; n: number };

export interface QuestionOption {
	key: string;
	label: string;
	/** True when this option is answered by typing as well as selecting; the table's
	 *  typed reply is spliced into `promptFragment`'s `{text}` placeholder. */
	open?: boolean;
	/** Concrete nouns and materials an image model reads well. Every option carries
	 *  one, including `open` ones — theirs holds the `{text}` splice point. */
	promptFragment: string;
}

/** One of V4's "And:" sub-questions — a single-select chip row under the options. */
export interface AndQuestion {
	/** Her sub-question, verbatim, without the "And:" prefix (the screen prints that). */
	prompt: string;
	options: { key: string; label: string; promptFragment: string }[];
}

/** The answer-row id an "And:" pick is stored under. */
export function andId(questionId: string): string {
	return `${questionId}:and`;
}

export interface Question {
	id: string;
	prompt: string;
	/** Q4, Q5 and Q6's lead-in lines, shown under the stem before the options. */
	lead?: string;
	options: QuestionOption[];
	/** Which prompt layer this question's answer feeds (prompt.ts's LayerInputs). */
	layer: 'mood' | 'materialsAndLight' | 'programme' | 'feel';
	select: SelectKind;
	/** The brief's own ◆ — this question's answer drives the drawn visual most. */
	diamond: boolean;
	/** The "PUSH —" line, verbatim. Shown as a hint under the stem; spoken at the table. */
	push?: string;
	/** True where the push line doubles as a typed capture field (Q2, Q5). */
	pushCapturesReply?: boolean;
	/** True where that captured reply is kept for the wall and the export but never composed
	 *  into the prompt (Q5's "refused to automate" — a decision, not a subject; `layers.ts`). */
	pushNotDrawn?: boolean;
	/** The "And:" sub-question, where V4 has one. Optional to answer; never blocks Next. */
	and?: AndQuestion;
	/**
	 * ANSWERED BY A SLIDER, not by a list of tiles — the 21 Sep minutes §4
	 * ("replace the binary outdoor-versus-indoor question with a percentage
	 * slider, 10% to 100%"). One percentage per option, in the options'
	 * own order, so the slider is a different WAY TO PICK an option and
	 * nothing downstream changes: the answer is still `keys: [oneKey]` and
	 * the prompt still gets that option's `promptFragment`. The numbers are
	 * data here rather than derived from the index because they are not
	 * evenly spaced — the jump from "pockets" to "saturated" is the big one.
	 */
	slider?: readonly number[];
	/**
	 * Whether the phone shows each option's picture. Default true; the
	 * 21 Sep 19:42 note turns it off on every question ("No visual cues",
	 * said four times) so the table reads plain words and the pictures do
	 * "back end work".
	 *
	 * THIS IS A PHONE SWITCH, NOT A DELETION. The art stays on disk, stays
	 * in `visuals-manifest.ts`, and stays in the printed question book —
	 * which is where the earlier "maintain visual 6 per page" note lives,
	 * that being page language about the deck rather than about a phone.
	 * `gen-question-book.mjs` does not read this field, on purpose.
	 */
	visualCues?: boolean;
	/** True only for `PROPOSED_QUESTIONS` (q12) — the question owner has not
	 *  blessed this; it never appears in the flow unless `config.ts`'s
	 *  `ENABLE_PROPOSED_QUESTIONS` is on. Absent (falsy) on every one of the nine. */
	proposed?: boolean;
}

export const QUESTIONS: Question[] = [
	{
		id: 'q2',
		// PLAIN ENGLISH, which is the whole point of the change.
		//
		// 21 Sep 19:03, the question owner: "do everyone understand material
		// world even means??" — so "What is your material world?" goes. The
		// replacement offered in the same thread was "the ambience and
		// materiality of your future city", and `materiality` is MORE jargon
		// than the phrase being retired, not less. A table of non-designers
		// reads "made of" and "feel"; nobody has to be told what they mean.
		prompt: 'What is your city made of, and how does it feel?',
		layer: 'materialsAndLight',
		select: { kind: 'one' },
		diamond: true,
		visualCues: false,
		// A QUESTION, like the other three. This was the set's one imperative —
		// "Name two materials…" — and an instruction in a box reads as homework
		// where a question reads as an invitation. The field has always been
		// optional; only this label was still ordering people about.
		push: 'Which two materials would you want to touch?',
		pushCapturesReply: true,
		options: [
			{
				key: 'stark-clinical',
				label: 'White and sleek',
				promptFragment:
					'white and brightly lit, sleek and shadowless; seamless resin, glass, polished steel; flawless surfaces'
			},
			{
				key: 'soft-pastel',
				label: 'Soft pastels',
				promptFragment:
					'blush, sage and butter; felt, bouclé, painted timber, matte ceramic; soft and tactile'
			},
			{
				key: 'raw-elemental',
				label: 'Concrete and stone',
				promptFragment:
					'grey, sand and ochre; board-marked concrete, stone, rough timber; rugged and unpolished'
			},
			{
				key: 'warm-earthy',
				label: 'Earth and timber',
				promptFragment:
					'terracotta, clay, olive and bronze; rammed earth, rattan, aged brass, linen; woven and textured'
			}
		]
	},
	{
		id: 'q8',
		// NO SLIDER. The 21 Sep minutes §4 asked for one (10-100%) and it was
		// built; the owner's call on 22 Sep is three answers — "20%, 40%, or
		// none ( stark difference between outdoors and indoors )". A slider
		// invites a table to split the difference, and the interesting answer
		// here is the stark one, which a continuous control quietly discourages
		// by putting it at an end stop.
		//
		// The three keys are KEPT FROM THE SIX, not invented: a row answered
		// under the slider still resolves, and the three dropped options
		// (courtyards, landscape indoors, nature as structure) still have art
		// on disk and in `visuals-manifest.ts`.
		prompt: 'How much of the outdoors is inside?',
		layer: 'materialsAndLight',
		select: { kind: 'one' },
		diamond: false,
		visualCues: false,
		// NOT "how does your greenery cool a mind" — a third of the tables
		// answer "None", and that line asks them about greenery they have just
		// said they do not want. A push has to be answerable from every option
		// above it, or it reads as the form ignoring the reply.
		push: 'Beyond how it looks, what is that choice for?',
		pushCapturesReply: true,
		options: [
			{
				key: 'sparse-inside-abundant-outside',
				label: 'None',
				// Her parenthesis is the whole point of this option, so the
				// fragment states the LINE rather than a small amount of planting.
				promptFragment:
					'no planting inside at all, a hard line between the sealed interior and the greenery beyond the glass'
			},
			{
				key: 'deliberate-pockets',
				label: '20%',
				promptFragment: 'deliberate pockets of greenery'
			},
			{
				key: 'saturated',
				label: '40%',
				// The KEY is `saturated` because it is the top of the old
				// six-option scale, and the fragment used to match the key —
				// "greenery threaded through the ENTIRE floor". The label now
				// says 40%, which is not "entire" by any reading, and the label
				// is what the table chose. Same class of mismatch as the sealed
				// cell whose picture contradicted its name: when a label and a
				// fragment disagree, the fragment is what gets drawn and the
				// table is the one who is surprised.
				promptFragment: 'planting through much of the floor, green in most sightlines but never the whole room'
			}
		]
	},
	{
		id: 'q5c',
		// The centaur framing is restored to the stem at the owner's request
		// (21 Sep 19:42) after being trimmed out earlier the same evening.
		prompt: 'Where does deep work happen in a centaur organisation?',
		layer: 'programme',
		select: { kind: 'one' },
		diamond: true,
		visualCues: false,
		push: 'What did your table refuse to automate?',
		pushCapturesReply: true,
		pushNotDrawn: true,
		options: [
			{
				key: 'glass-dome',
				label: 'The dome in the rainforest',
				promptFragment:
					'a glass geodesic room standing alone among mature trees, one person working inside, forest pressing against every pane'
			},
			{
				key: 'garden-cafe',
				label: 'The zen garden café',
				promptFragment:
					'a large planted indoor cafe of mixed settings, long benches, deep booths and counters between raised planters, people working across all of them'
			},
			{
				key: 'immersive-chamber',
				label: 'The immersion chamber',
				promptFragment:
					'a sealed immersive chamber whose curved walls and floor become another place entirely, deep-sea light rippling over one working figure'
			},
			{
				key: 'sealed-cell',
				// Renamed from "the sealed cell" to the owner's own "hermetically
				// sealed mud hut", so the FRAGMENT moves with the label — an
				// acoustic box and an earth room do not draw alike, and a label
				// the picture contradicts is worse than either on its own.
				label: 'The sealed mud hut',
				promptFragment:
					'a small windowless room of thick hand-built earth walls, a single low doorway, no screens and no devices, one person working by hand at a plain table'
			},
			{
				// THE FIFTH SLOT IS A PARAGRAPH, not a fifth picture — "reduce
				// this to 4 options and leave a paragraph for 5. Any other space
				// from your imagination". `open` options were gone in V4; this
				// brings one back, and `layers.ts`'s `fragmentOf` splices the
				// typed words into `{text}` on both composers, so what a table
				// invents here is drawn.
				key: 'other-space',
				label: 'Somewhere from our imagination',
				open: true,
				promptFragment: '{text}'
			}
		]
	},
	{
		id: 'q6r',
		// ORDERED CLOSED TO OPEN, and that ordering is the answer, not decoration.
		// 22 Sep: "igloo .. mix between close and open spaces. igloo is close,
		// outdoors can be grasslands". A table reading top to bottom is walking
		// a spectrum from a room you crawl into to no room at all, so the list
		// itself asks how much enclosure the table wants — a question none of
		// the six options could ask on its own.
		//
		// The order below is enclosure, not brightness: the water room is
		// warm, steamy and sealed, so it sits BEFORE the tea room, whose paper
		// screens are the first thing on the list you can see daylight through.
		//
		// FOUR, NOT SIX. The earth room and the sand room are gone, for the same
		// reason the city list went from six to four: the NAMES collided. And this
		// screen shows no pictures (`visualCues: false`), so the name is the whole
		// of what a table gets.
		//
		//   igloo      <-> earth room   both "a small round room you get into and
		//                               sit down in"; only the material told them
		//                               apart, and the material was not in the name
		//   earth room <-> q5c's        an earthen hut in two separate questions.
		//                 "sealed       One table picks both, and one prompt then
		//                 mud hut"      describes the same room twice
		//   sand room  <-> outdoors     both "no furniture, sit on the ground"
		//
		// What is left is four with nothing in common: sealed and dry, sealed and
		// wet, a room that opens, and no room at all. The igloo keeps the closed
		// end because it is the owner's own anchor for it ("igloo is close"), and
		// dropping the earth room leaves exactly ONE earthen space in the app —
		// q5c's, which is where the owner put it.
		//
		// A dropped OPTION is not a dropped question: `fragmentsFor` resolves by
		// key within the live question, so a row stored under `mud-hut` composes
		// nothing for this layer. Same trade q8 already took when the slider went.
		prompt: 'Where do people recharge?',
		layer: 'programme',
		select: { kind: 'one' },
		diamond: true,
		visualCues: false,
		push: 'What recharge is your table short of?',
		pushCapturesReply: true,
		options: [
			{
				key: 'igloo',
				label: 'The igloo',
				promptFragment:
					'a smooth white domed room entered on hands and knees, curved seamless walls, no windows at all, one person lying back in soft indirect light'
			},
			{
				key: 'water-room',
				label: 'The water room',
				promptFragment:
					'a warm enclosed bathing room, steam drifting under a high skylight, two people floating in water up to the chest, no devices anywhere'
			},
			{
				key: 'tea-room',
				label: 'The tea room',
				promptFragment:
					'a small tatami room whose paper screens are slid open to a garden, a low kettle and a single flower, people kneeling on the mats'
			},
			{
				key: 'outdoors',
				label: 'Outdoors, on the grass',
				promptFragment:
					'open grassland under a wide sky, no building in the frame at all, wind moving the grass, people sitting and walking on it'
			}
		]
	},
];

/**
 * PROPOSED QUESTIONS — game-flow.md §7's remaining proposal for the question
 * owner ("workstation ↔ urban alignment"). The other proposal ("how do
 * agile teams / centaurs form") is superseded: V3's own Q9 (centaurs) and
 * Q10 (agile) now answer it directly, so the old q13 is dropped. Only q12
 * remains: never in `QUESTIONS` itself (which stays fixed at V4's nine and
 * keeps its own shape guards below), and never in the active flow unless
 * `config.ts`'s `ENABLE_PROPOSED_QUESTIONS` is on. `layers.ts` maps it into
 * the programme layer's urban-edge/ground-plane clause, gated the same way.
 */
export const PROPOSED_QUESTIONS: Question[] = [
	{
		id: 'q12',
		prompt: 'How does your workstation sit inside the city around it?',
		layer: 'programme',
		select: { kind: 'one' },
		diamond: false,
		proposed: true,
		push: "name the one journey your future removes from someone's day, and the one it keeps on purpose.",
		options: [
			{
				key: 'building-is-the-city',
				label: 'The building is the city in miniature: everything you need is inside it',
				promptFragment:
					'a self-contained building holding the whole city in miniature — shops, clinic, gym, transit stop, all inside one floorplate'
			},
			{
				key: 'front-door-onto-street',
				label: 'A front door onto the street, and the city does the rest',
				promptFragment:
					'a plain front door opening straight onto a working street, the surrounding city visibly doing the rest'
			},
			{
				key: 'campus-crossed-on-foot',
				label: 'A campus you cross on foot, work happening between the buildings',
				promptFragment:
					'a low campus of separate pavilions linked by open-air paths, work visibly spilling into the gaps between buildings'
			},
			{
				key: 'workstation-follows-you',
				label: 'The workstation follows the person: a seat in the office, a seat in a café, a seat at home, all equal',
				promptFragment:
					'an identical portable workstation setup echoed across an office desk, a café table and a home nook, none more official than the other'
			},
			{
				key: 'city-comes-to-building',
				label: 'The city comes to the building — services, retail, transit arriving at the floorplate',
				promptFragment:
					'a ground floor where transit, retail and services arrive directly at the floorplate, the city delivered to the building rather than the reverse'
			}
		]
	}
];

/** `QUESTIONS`, plus `PROPOSED_QUESTIONS` when `config.ts`'s flag is on. What the
 *  flow, `layers.ts` and the answer-id lists actually iterate over. */
export const ACTIVE_QUESTIONS: Question[] = ENABLE_PROPOSED_QUESTIONS
	? [...QUESTIONS, ...PROPOSED_QUESTIONS]
	: QUESTIONS;

export interface WildcardQuestion {
	id: 'wildcard';
	prompt: string;
	options: QuestionOption[];
}

export const WILDCARD: WildcardQuestion = {
	id: 'wildcard',
	prompt: 'Any other flights of fancy?',
	options: [
		{
			key: 'wildcard-open',
			label: 'Wildcard',
			open: true,
			promptFragment: '{text}'
		}
	]
};

export interface TableAnswers {
	table: number;
	future?: string;
	byQuestion: Record<string, { keys: string[]; text?: Record<string, string> }>;
	wildcard?: string;
}

// --- Shape guards -----------------------------------------------------------
// Runtime, not type-level: `QUESTIONS` is typed `Question[]`, a real array,
// so its length and order are not literal types the compiler can pin.

/**
 * V5's four, in the order the 21 Sep minutes set: outdoors, deep work,
 * recharge, materials. The lens is screen one and the wildcard is the last
 * screen, so the phone still counts six things; these four are the
 * multiple-choice questions between them.
 *
 * Cut from V4's nine (q3 arrival, q4w workstation, q7 technology, q10
 * "brilliant at one", q11 three words). q4w was MERGED into q5c rather than
 * dropped — the minutes ask one deep-work question where there were two.
 * q11's job (light, weather and time) moved to each lens's `lightLine`; see
 * that field's note, because doing it wrongly is what made the wall dark.
 */
export const V4_IDS = ['q2', 'q8', 'q5c', 'q6r'] as const;

/** The pseudo-question id the lens pick is stored under. `q1` stores the era. */
export const FUTURE_ID = 'future';

/**
 * WHAT COUNTS AS A STEP — the ONE scale, for the phone and for the room.
 *
 * There were two, and they disagreed. The phone counted the lens, the four
 * questions and the wildcard (six). The wall, the desk and the front page
 * counted `QUESTIONS.length` (four) as the denominator while the numerator
 * counted every distinct answered id — which includes `future`, `q1` (the
 * era chip) and `wildcard`. A table that had answered NOTHING but picked
 * its lens already read "2 of 4" on the wall, and it saturated at "4 of 4"
 * the moment it answered the second of four questions. For most of a
 * session the wall would have said every table was finished while they were
 * halfway.
 *
 * It was survivable at nine questions — the three extra ids were noise
 * against a denominator of nine, and `room.ts`'s own comment records the
 * milder symptom it caused then ("a table on its third question reads 6 of
 * 9"). The 21 Sep cut to four made the noise nearly as large as the scale.
 *
 * `q1` is not here because it is the era CHIP on the lens screen, not a
 * screen of its own — the phone's `FLOW_QUESTIONS` has always filtered it.
 * An "And:" row is part of its parent's step, which `room.ts` already
 * handles where it counts.
 */
export const STEP_IDS: readonly string[] = [
	FUTURE_ID,
	...QUESTIONS.filter((q) => q.id !== 'q1').map((q) => q.id),
	WILDCARD.id
];

if (QUESTIONS.map((q) => q.id).join(',') !== V4_IDS.join(',')) {
	throw new Error(
		`questions are not V4's set in her order (${V4_IDS.join(',')}), got ${QUESTIONS.map((q) => q.id).join(',')}`
	);
}

// Every surviving question is a ◆ except q8 — the four that are left are the
// four that drove the drawn visual most, which is why these four survived.
const DIAMOND_IDS = QUESTIONS.filter((q) => q.diamond).map((q) => q.id);
const PUSH_CAPTURE_IDS = QUESTIONS.filter((q) => q.pushCapturesReply).map((q) => q.id);
if (DIAMOND_IDS.join(',') !== 'q2,q5c,q6r') {
	throw new Error(`expected diamond (◆) questions q2,q5c,q6r, got ${DIAMOND_IDS.join(',')}`);
}
// EVERY question takes typed words now, not just two of them — the 21 Sep
// note "similar to KL, allow open text below", KL being generation 1, where
// every field was free text. q5c's reply is the only one kept off the render
// (`pushNotDrawn`): "what did your table refuse to automate" is a decision
// about the table, which has nothing to paint.
if (PUSH_CAPTURE_IDS.join(',') !== 'q2,q8,q5c,q6r') {
	throw new Error(`expected every question to capture typed words, got ${PUSH_CAPTURE_IDS.join(',')}`);
}

/**
 * NO QUESTION CARRIES AN "And:" ROW ANY MORE.
 *
 * 21 Sep 22:26, with two annotated screenshots framing exactly these rows —
 * "And: how far does it go?" and "And: where does the AI sit?" — and the
 * line "Remove these additional inputs." They were an extra row of options
 * under a screen that already had six, and the event wants fewer things to
 * tap, not more.
 *
 * THE TYPE AND THE MACHINERY STAY, BUT A STORED `:and` ROW NO LONGER
 * COMPOSES. `layers.ts` builds `OPTIONS_BY_ID` by filtering `q.and`, so
 * taking the data out takes the lookup with it — an older row under
 * `q2:and` is read, found to match no option, and contributes nothing.
 *
 * That is deliberate and it is NOT the `RETIRED_ZONES` case. A zone key is
 * structural: an image row cannot be labelled or displayed without one, so
 * it must resolve for ever. An "And:" fragment is additive to a prompt, so
 * losing it degrades a regenerated old render by one clause rather than
 * breaking it. `AndQuestion`, `andId()` and the review screen's "· And:"
 * suffix stay because they are what stops a stored row crashing anything.
 *
 * WHAT THE PROMPT LOSES, recorded rather than discovered later: q2's scale
 * pick was the CAMERA clause ("wide lens, high ceilings, open floor"),
 * q5c's was where the AI reads in the frame, q6r's was how much of the
 * frame the biome takes. The hero still states its own camera — "one
 * elevated three-quarter view" plus a per-table vantage — so the frame is
 * not unheld, but it is now the same lens for every table.
 */
const AND_IDS = QUESTIONS.filter((q) => q.and).map((q) => q.id);
if (AND_IDS.length !== 0) {
	throw new Error(`"And:" rows were removed on 21 Sep; found one on ${AND_IDS.join(',')}`);
}

/**
 * A slider has to name one percentage per option or it cannot label its own
 * stops — and a mismatch would silently drop the top of the scale, which is
 * the end of it the minutes cared about ("cabins in a forest").
 */
for (const q of QUESTIONS) {
	if (q.slider && q.slider.length !== q.options.length) {
		throw new Error(`${q.id}: slider has ${q.slider.length} stops for ${q.options.length} options`);
	}
}

if (PROPOSED_QUESTIONS.length !== 1) {
	throw new Error(`expected exactly 1 proposed question (q12), got ${PROPOSED_QUESTIONS.length}`);
}
if (!(PROPOSED_QUESTIONS[0].id === 'q12' && PROPOSED_QUESTIONS[0].proposed === true)) {
	throw new Error('the one proposed question must be q12, marked proposed: true');
}
if (ACTIVE_QUESTIONS.length !== (ENABLE_PROPOSED_QUESTIONS ? 5 : 4)) {
	throw new Error(`ACTIVE_QUESTIONS length does not match ENABLE_PROPOSED_QUESTIONS (got ${ACTIVE_QUESTIONS.length})`);
}
