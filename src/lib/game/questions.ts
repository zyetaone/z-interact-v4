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
		push: 'Name two materials you would want to touch.',
		pushCapturesReply: true,
		options: [
			{
				key: 'stark-clinical',
				label: 'White and spotless',
				promptFragment:
					'pure white and shadowless; seamless resin, glass, polished steel; shiny and flawless'
			},
			{
				key: 'soft-pastel',
				label: 'Soft and pale',
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
		],
		and: {
			prompt: 'what scale?',
			options: [
				{ key: 'cathedral', label: 'Cathedral', promptFragment: 'wide lens, low, a tall volume overhead' },
				{ key: 'generous', label: 'Generous', promptFragment: 'wide lens, high ceilings, open floor' },
				{ key: 'human', label: 'Human', promptFragment: 'eye level, ceilings within reach' },
				{ key: 'nested', label: 'Nested', promptFragment: 'medium lens from an alcove, the hall beyond' },
				{ key: 'compressed', label: 'Compressed', promptFragment: 'tight framing at eye level, close walls' }
			]
		}
	},
	{
		id: 'q8',
		// The lead became the stem: the cognitive city is named on screen one
		// now (`futures.ts`'s LENS_STEM), so this screen does not have to
		// re-establish it before asking its own question.
		prompt: 'How much of the outdoors is inside?',
		layer: 'materialsAndLight',
		select: { kind: 'one' },
		slider: [10, 25, 40, 60, 80, 100],
		diamond: false,
		visualCues: false,
		push: 'How does your greenery cool a mind, not just a body?',
		pushCapturesReply: true,
		options: [
			{
				key: 'sparse-inside-abundant-outside',
				label: 'Sparse inside, green outside',
				promptFragment: 'sparse planting inside, abundant greenery beyond the glass'
			},
			{
				key: 'deliberate-pockets',
				label: 'Pockets of planting',
				promptFragment: 'deliberate pockets of greenery'
			},
			{
				key: 'saturated',
				label: 'Saturated',
				promptFragment: 'greenery threaded through the entire floor'
			},
			{
				key: 'courtyards',
				label: 'Courtyards',
				promptFragment: 'planted courtyards cut open to the sky, the floor plate broken by them'
			},
			{
				key: 'landscape-indoors',
				label: 'Landscape indoors',
				promptFragment: 'trees, water, rock and soil indoors'
			},
			{
				key: 'nature-as-structure',
				label: 'Nature as structure',
				promptFragment: 'planted terraces and open-air floors, the building a garden'
			}
		]
	},
	{
		id: 'q5c',
		// The centaur framing is restored to the stem at the owner's request
		// (21 Sep 19:42) after being trimmed out earlier the same evening.
		prompt: 'Where does deep work happen in a centaur organisation?',
		lead: 'The building already thinks. What does your table keep for itself?',
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
		],
		and: {
			prompt: 'where does the AI sit?',
			options: [
				{ key: 'unseen', label: 'Unseen', promptFragment: 'the AI unseen, no device anywhere' },
				{ key: 'in-the-light', label: 'In the light', promptFragment: 'the AI present only as light' },
				{ key: 'on-the-surfaces', label: 'On the surfaces', promptFragment: 'the AI on the walls and tables' },
				{ key: 'in-the-room', label: 'In the room', promptFragment: 'a hologram or figure at the table' }
			]
		}
	},
	{
		id: 'q6r',
		prompt: 'Where do people recharge?',
		lead: 'Off a screen, into a different posture.',
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
					'a smooth white domed room entered on hands and knees, curved seamless walls, one person lying back in soft indirect light'
			},
			{
				key: 'mud-hut',
				label: 'The earth room',
				promptFragment:
					'a round room of thick hand-built earth walls, a low doorway, woven mats on a beaten floor, people sitting on the ground'
			},
			{
				key: 'tea-room',
				label: 'The tea room',
				promptFragment:
					'a small tatami room with paper screens, a low kettle and a single flower, people kneeling on the mats'
			},
			{
				key: 'water-room',
				label: 'The water room',
				promptFragment:
					'a warm shallow bathing room in daylight, steam drifting, two people floating in water up to the chest, no devices anywhere'
			},
			{
				key: 'sand-room',
				label: 'The sand room',
				promptFragment:
					'a bright room with a deep raked sand floor and no furniture at all, people sitting and lying directly on it, tall windows above'
			},
			{
				key: 'outdoors',
				label: 'Outdoors',
				promptFragment:
					'an open grassland terrace under a wide sky, wind moving the grass, people walking and stretching away from any building'
			}
		],
		and: {
			prompt: 'how far does it go?',
			options: [
				{ key: 'a-view-of-it', label: 'A view of it', promptFragment: 'only a view through the far glass' },
				{ key: 'a-room-that-evokes-it', label: 'A room that evokes it', promptFragment: 'an interior room borrowing its material' },
				{ key: 'fully-immersive', label: 'Fully immersive', promptFragment: 'the biome filling the frame' },
				{ key: 'the-real-thing', label: 'The real thing', promptFragment: 'outdoors inside it, the building at the edge' }
			]
		}
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
 * The "And:" sub-questions that survived. q6r's is the realism scale the
 * minutes' §8 asked for ("a view of it / a room that evokes it / fully
 * immersive / the real thing") — it was already built, so §8's open question
 * needs no new screen.
 */
const AND_IDS = QUESTIONS.filter((q) => q.and).map((q) => q.id);
if (AND_IDS.join(',') !== 'q2,q5c,q6r') {
	throw new Error(`expected "And:" sub-questions on q2,q5c,q6r, got ${AND_IDS.join(',')}`);
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
