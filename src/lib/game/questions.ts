/**
 * QUESTION SET — VERSION 3 (BRIEF.md §"The questions — VERSION 3", the
 * question owner's 18 Sep 21:45 send, which supersedes the 07:44 set this
 * file previously carried). Every `label` is copied exactly, including the
 * ◆ flags (as `diamond: boolean`, now Q2/Q4/Q7/Q9/Q10 — five, not three)
 * and the "Push:" lines (as `push`, presenter prompts, not form fields;
 * only Q2 and Q10 double as a typed capture field via `pushCapturesReply` —
 * Q4 and Q9 capture their free text through `open` facet options instead,
 * because V3 gives them no generic "Push:" line to hang a capture field on).
 *
 * Fixed interface the plumbing builds against (routes, `answers.remote.ts`,
 * `prompt.ts`'s programme layer): an ordered `QUESTIONS` array, each with a
 * stable `id` (used as the D1 `answers.question_id` and never renumbered —
 * renumbering would orphan already-saved rows) and options, plus an
 * optional free-text wildcard question.
 *
 * What changed vs the superseded set (BRIEF.md's own summary): Q1 options
 * reworded; Q3 merges the old arrival + wayfinding questions; Q4 "Where
 * does the hardest thinking happen?" is new (◆, facets, up to 3); Q5 becomes
 * "what else protects and restores" (its two acoustic/null-signal options
 * moved to Q4, two new restoration options added); Q6/Q8/Q11 unchanged; Q7
 * absorbs the old Q9's sensing content and gains ◆ + `many`; Q9 "Where do
 * the centaurs work" replaces the sensing content (◆, facets, up to 3); Q10
 * "What makes your workplace agile?" is new (◆, single-select, plus a
 * "hardest" capture on its push line) — Q9+Q10 together also answer the old
 * proposed "how do agile teams/centaurs form" question, so `PROPOSED_QUESTIONS`
 * drops q13; q12 (urban alignment) remains the only proposal.
 *
 * Type extensions beyond the original stub (documented per the brief):
 * `layer` gained `'mood'` (Q1 feeds the mood/era layer, which the original
 * 3-value union had no slot for); `Question` gained `select`, `diamond`,
 * `push`, `pushCapturesReply` and `lead` (Q4/Q9's one-line lead-in sentence
 * before their facet options); `SelectKind`'s `many` variant gained `max`
 * (Q4/Q9/Q6/Q7/Q10 facets are capped multi-selects, not open-ended); `id`s,
 * `TABLE_COUNT`, `WILDCARD`, `TableAnswers` are unchanged.
 */

import { ENABLE_PROPOSED_QUESTIONS } from './config';

export const TABLE_COUNT = 20;

/** How a question is answered — mirrors the brief's own wording, not an invented scale. */
export type SelectKind =
	| { kind: 'one' }
	| { kind: 'many'; min?: number; max?: number }
	| { kind: 'pick'; n: number };

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

export interface Question {
	id: string;
	prompt: string;
	/** Q4 and Q9's one-line lead-in sentence, shown above their facet options. */
	lead?: string;
	options: QuestionOption[];
	/** Which prompt layer this question's answer feeds (prompt.ts's LayerInputs). */
	layer: 'mood' | 'materialsAndLight' | 'programme' | 'feel';
	select: SelectKind;
	/** The brief's own ◆ — this question's answer drives the drawn visual most. */
	diamond: boolean;
	/** The "Push:" line, verbatim. Shown as a hint under the stem; spoken at the table. */
	push?: string;
	/** True only for Q2 and Q10 — the only two diamond questions V3 gives a generic
	 *  "Push:" line to, which doubles there as a typed capture field. Q4 and Q9 are
	 *  also diamond and also capture free text, but via `open` facet options instead
	 *  (V3 gives them no generic push line to hang this flag on); Q7 is diamond and
	 *  spoken-only, no capture at all. */
	pushCapturesReply?: boolean;
	/** True only for `PROPOSED_QUESTIONS` (q12) — the question owner has not
	 *  blessed this; it never appears in the flow unless `config.ts`'s
	 *  `ENABLE_PROPOSED_QUESTIONS` is on. Absent (falsy) on every one of the 11. */
	proposed?: boolean;
}

export const QUESTIONS: Question[] = [
	{
		id: 'q2',
		prompt: 'What is your material world?',
		layer: 'materialsAndLight',
		select: { kind: 'one' },
		diamond: true,
		push: 'name two materials you would actually want to touch.',
		pushCapturesReply: true,
		options: [
			{
				key: 'deep-low-lit',
				label: 'Deep and low-lit: dark surfaces, pools of warm light',
				promptFragment: 'deep and low-lit material world: dark surfaces, pools of warm light, shadow held deliberately between them'
			},
			{
				key: 'clean-clinical',
				label: 'Clean and clinical: white, bright, precise',
				promptFragment: 'clean and clinical material world: white surfaces, bright even light, precise unbroken edges'
			},
			{
				key: 'pastel-warm',
				label: 'Pastel and warm: soft colour, nostalgic, human-scaled',
				promptFragment: 'pastel and warm material world: soft muted colour, nostalgic rounded forms, human-scaled furniture'
			},
			{
				key: 'raw-elemental',
				label: 'Raw and elemental: concrete, stone, timber',
				promptFragment: 'raw and elemental material world: exposed concrete, quarried stone, unfinished timber, deliberate surface texture'
			},
			{
				key: 'jewel-tones',
				label: 'Jewel tones',
				promptFragment: 'jewel-toned material world: saturated emerald, sapphire and garnet surfaces against dark neutral ground'
			},
			{
				key: 'undersea',
				label: 'Undersea',
				promptFragment: 'undersea-inspired material world: deep blues, curved glazing evoking a pressure hull, filtered aqueous light'
			}
		]
	},
	{
		id: 'q3',
		prompt: 'How do people arrive and find their way?',
		layer: 'programme',
		select: { kind: 'one' },
		diamond: false,
		push: 'what is the first thing a visitor sees, hears and smells?',
		options: [
			{
				key: 'human-or-ai-order',
				label: 'A human welcome or an AI one, and in what order',
				open: true,
				promptFragment: 'an arrival that blends a human welcome and an AI one, ordered as the table specifies: {text}'
			},
			{
				key: 'voice-guide',
				label: 'Voice guide',
				promptFragment: 'wayfinding led by an ambient voice guide, no visible signage needed'
			},
			{
				key: 'physical-signage',
				label: 'Physical signage',
				promptFragment: 'movement guided by clear physical signage, wayfinding markers at every junction'
			},
			{
				key: 'dynamic-signage',
				label: 'Dynamic signage that changes with you',
				promptFragment: 'movement guided by dynamic digital signage that reconfigures for each person passing'
			},
			{
				key: 'light-paths',
				label: 'Light paths in the floor',
				promptFragment: 'movement guided by illuminated light paths embedded in the floor, tracing the route ahead'
			},
			{
				key: 'no-signage',
				label: 'No signage at all, because the layout is obvious',
				promptFragment: 'movement needing no signage at all — a layout so legible the route is self-evident'
			},
			{
				key: 'space-finds-you',
				label: 'The space finds you rather than you finding it',
				promptFragment: 'a space that finds the person rather than the reverse — desks, rooms or zones reconfiguring toward them'
			}
		]
	},
	{
		id: 'q4',
		prompt: 'Where does the hardest thinking happen?',
		lead: 'The one place someone goes for two uninterrupted hours of real thought.',
		layer: 'materialsAndLight',
		select: { kind: 'many', min: 1, max: 3 },
		diamond: true,
		options: [
			{
				key: 'what-shields-it',
				label: 'What shields it: walls, water, distance, height',
				promptFragment: 'shielded by walls, water, distance and height — physical layers separating it from the rest of the floor'
			},
			{
				key: 'what-its-made-of',
				label: 'What it is made of',
				open: true,
				promptFragment: 'built from materials the table names: {text}'
			},
			{
				key: 'one-room-or-many',
				label: 'One room or many small ones',
				promptFragment: 'either a single dedicated room, or several small ones scattered through the floor, each holding one person'
			},
			{
				key: 'who-is-allowed-in',
				label: 'Who is allowed in',
				open: true,
				promptFragment: 'access reserved as the table specifies: {text}'
			},
			{
				key: 'sub-35db-acoustic',
				label: 'Sub-35dB acoustic cores',
				promptFragment: 'an acoustic core rated below 35 decibels, dense sound-absorbing surfaces, near silence'
			},
			{
				key: 'null-zones-no-signal',
				label: 'Null zones with no signal',
				promptFragment: 'a null zone with no signal at all — deliberately unconnected, unmarked, a room the network does not reach'
			}
		]
	},
	{
		id: 'q5',
		prompt: 'What else protects and restores attention?',
		layer: 'materialsAndLight',
		select: { kind: 'one' },
		diamond: false,
		options: [
			{
				key: 'glass-domes-gardens',
				label: 'Glass domes in gardens',
				promptFragment: 'a glass dome set within a garden, transparent enclosure for open-air focus'
			},
			{
				key: 'meditation-rooms',
				label: 'Immersive meditation rooms',
				promptFragment: 'immersive meditation rooms — softly enclosed, low light, no hard edges'
			},
			{
				key: 'deep-sea-chambers',
				label: 'Deep-sea simulation chambers',
				promptFragment: 'a deep-sea simulation chamber — curved dark walls, projected pressure and depth, isolating stillness'
			},
			{
				key: 'sky-walks',
				label: 'Sky walks',
				promptFragment: 'an elevated sky walk, open to air and view, height itself protecting the thought'
			},
			{
				key: 'after-draining-day',
				label: 'Where people go after a draining day',
				promptFragment: 'a retreat for after a draining day — dim, soft-edged, no demands made of the person inside'
			},
			{
				key: 'nap-walk-water-dark',
				label: 'Nap, walk, water, darkness',
				promptFragment: 'restoration through the plainest tools: a place to nap, to walk, to be near water, to sit in darkness'
			}
		]
	},
	{
		id: 'q6',
		prompt: 'What do you sit on, and where do you meet?',
		layer: 'programme',
		select: { kind: 'many', min: 1 },
		diamond: false,
		options: [
			{
				key: 'fixed-or-none',
				label: 'Fixed desks or none at all',
				promptFragment: 'either fixed conventional desks, or none at all — no assigned desking anywhere'
			},
			{
				key: 'self-moving-furniture',
				label: 'Furniture that moves itself',
				promptFragment: 'self-repositioning furniture, motorised desks and seating rearranging on their own'
			},
			{
				key: 'rooms-change-size',
				label: 'Rooms that change size',
				promptFragment: 'rooms with movable walls that visibly change size to fit the group inside them'
			},
			{
				key: 'meet-in-gardens-stairs',
				label: 'Meeting in gardens, on stairs, while walking',
				promptFragment: 'meetings held in gardens, on generous stair landings, or while walking a circulation loop'
			},
			{
				key: 'standing-lying-floor',
				label: 'Standing, lying down, floor-level',
				promptFragment: 'a mix of standing-height, floor-level and reclined meeting postures, no single seated norm'
			},
			{
				key: 'disappeared-by-2035',
				label: 'What has disappeared entirely by 2035',
				open: true,
				promptFragment: 'a workplace with one conspicuous absence, specified by the table: {text}, deliberately missing'
			}
		]
	},
	{
		id: 'q7',
		prompt: 'Is the technology obvious or invisible?',
		layer: 'materialsAndLight',
		select: { kind: 'many', min: 1 },
		diamond: true,
		push: 'where is there visibly no technology, on purpose?',
		options: [
			{
				key: 'walls-become-screens',
				label: 'Walls that become screens',
				promptFragment: 'walls that become full-surface digital screens, technology fully overt in the architecture'
			},
			{
				key: 'writable-glass',
				label: 'Writable glass',
				promptFragment: 'writable smart glass surfaces throughout, technology present as a writable material'
			},
			{
				key: 'holograms',
				label: 'Holograms',
				promptFragment: 'volumetric holographic displays floating in open space, technology visibly immaterial'
			},
			{
				key: 'ambient-light-interface',
				label: 'Ambient light as the interface',
				promptFragment: 'ambient light itself as the interface — colour and intensity communicating state, no screens'
			},
			{
				key: 'notice-when-needed',
				label: 'Tech you notice only when you need it',
				promptFragment: 'technology fully hidden until needed, surfaces reading as ordinary until activated'
			},
			{
				key: 'senses-and-adjusts',
				label: 'The space senses noise, air, occupancy and mood, and adjusts before you ask',
				promptFragment:
					'a space that senses noise, air, occupancy and mood in real time, and adjusts before it is asked to — visibly mid-adjustment'
			},
			{
				key: 'analogue-zones',
				label: 'Deliberately analogue zones',
				promptFragment: 'deliberately analogue zones with no technology at all, paper, pen and unpowered furniture'
			}
		]
	},
	{
		id: 'q8',
		prompt: 'How much nature, and where?',
		layer: 'materialsAndLight',
		select: { kind: 'one' },
		diamond: false,
		push: 'Singapore is hot and humid. How does your greenery cool a mind as well as a body?',
		options: [
			{
				key: 'full-rainforest',
				label: 'Full rainforest indoors',
				promptFragment: 'a full indoor rainforest, dense multi-storey planting, humid canopy overhead'
			},
			{
				key: 'deliberate-pockets',
				label: 'Deliberate pockets of greenery',
				promptFragment: 'deliberate, curated pockets of greenery placed at specific pause points, not everywhere'
			},
			{
				key: 'sparse-inside-abundant-outside',
				label: 'Sparse inside, abundant outside',
				promptFragment:
					'sparse planting inside, abundant greenery visible just outside through glazing — nature held at the edge'
			},
			{
				key: 'water-rock-soil',
				label: 'Water, rock and soil, not just plants',
				promptFragment: 'nature as water, rock and exposed soil as much as plants — a garden with geology in it'
			},
			{
				key: 'walk-into-nature',
				label: 'Nature you can walk into rather than look at',
				promptFragment: 'nature you walk into rather than observe — a path running through planting, not past it'
			}
		]
	},
	{
		id: 'q9',
		prompt: 'Where do the centaurs work, and what do they need?',
		lead: 'Humans and AI working as one unit: AI brings speed, pattern and scale, people bring judgement, ethics, creativity and context.',
		layer: 'programme',
		select: { kind: 'many', min: 1, max: 3 },
		diamond: true,
		options: [
			{
				key: 'room-look',
				label: 'What does that room look like',
				promptFragment: 'a centaur room whose shape and materials the table designed for humans and AI working side by side'
			},
			{
				key: 'ai-medium',
				label: 'Is the AI on screens, in the light, in the walls, or unseen',
				promptFragment: 'AI presence rendered as the table chose — on screens, folded into the light, embedded in the walls, or entirely unseen'
			},
			{
				key: 'deciding-together',
				label: 'What are they deciding together',
				promptFragment: 'a shared table where the human and the AI are visibly deciding something together'
			},
			{
				key: 'space-needs',
				label: "What does the space need that a meeting room with a screen doesn't have",
				promptFragment: 'a room built for centaur work with something an ordinary meeting room with a screen does not have'
			},
			{
				key: 'refused-to-automate',
				label: 'What did your table refuse to automate',
				open: true,
				promptFragment: 'one decision the table refused to hand to the AI, specified by the table: {text}, kept deliberately human'
			}
		]
	},
	{
		id: 'q10',
		prompt: 'What makes your workplace agile?',
		layer: 'programme',
		select: { kind: 'one' },
		diamond: true,
		push: 'pick the one your design does best, and show us where. Then name the one you found hardest.',
		pushCapturesReply: true,
		options: [
			{
				key: 'protects-attention',
				label: 'It protects attention instead of competing for it',
				promptFragment: 'an agile workplace that protects attention rather than competing for it — the chosen principle made visible in the room'
			},
			{
				key: 'supports-judgement',
				label: 'It supports judgement, not just efficiency',
				promptFragment: "an agile workplace built to support judgement over raw efficiency, the room slowing down exactly where a decision needs weight"
			},
			{
				key: 'adapts-as-needs-change',
				label: 'It adapts as team needs change',
				promptFragment: "an agile workplace that visibly reconfigures as a team's needs change, furniture and walls in motion"
			},
			{
				key: 'knows-when-to-step-back',
				label: 'It knows when to step back',
				promptFragment: 'an agile workplace that recedes when it is not needed — technology and structure stepping back to leave room for people'
			}
		]
	},
	{
		id: 'q11',
		prompt: 'In three words, what should it feel like?',
		layer: 'feel',
		select: { kind: 'pick', n: 3 },
		diamond: false,
		options: [
			{ key: 'calm', label: 'Calm', promptFragment: 'calm' },
			{ key: 'electric', label: 'Electric', promptFragment: 'electric' },
			{ key: 'sacred', label: 'Sacred', promptFragment: 'sacred' },
			{ key: 'playful', label: 'Playful', promptFragment: 'playful' },
			{ key: 'focused', label: 'Focused', promptFragment: 'focused' },
			{ key: 'alive', label: 'Alive', promptFragment: 'alive' },
			{ key: 'effortless', label: 'Effortless', promptFragment: 'effortless' },
			{ key: 'yours', label: 'Yours', promptFragment: 'personal, unmistakably yours' }
		]
	}
];

/**
 * PROPOSED QUESTIONS — game-flow.md §7's remaining proposal for the question
 * owner ("workstation ↔ urban alignment"). The other proposal ("how do
 * agile teams / centaurs form") is superseded: V3's own Q9 (centaurs) and
 * Q10 (agile) now answer it directly, so the old q13 is dropped. Only q12
 * remains: never in `QUESTIONS` itself (which stays fixed at 11 and keeps
 * its own q1..q11 shape guards below), and never in the active flow unless
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
				promptFragment: 'a self-contained building holding the whole city in miniature — shops, clinic, gym, transit stop, all inside one floorplate'
			},
			{
				key: 'front-door-onto-street',
				label: 'A front door onto the street, and the city does the rest',
				promptFragment: 'a plain front door opening straight onto a working street, the surrounding city visibly doing the rest'
			},
			{
				key: 'campus-crossed-on-foot',
				label: 'A campus you cross on foot, work happening between the buildings',
				promptFragment: 'a low campus of separate pavilions linked by open-air paths, work visibly spilling into the gaps between buildings'
			},
			{
				key: 'workstation-follows-you',
				label: 'The workstation follows the person: a seat in the office, a seat in a café, a seat at home, all equal',
				promptFragment: 'an identical portable workstation setup echoed across an office desk, a café table and a home nook, none more official than the other'
			},
			{
				key: 'city-comes-to-building',
				label: 'The city comes to the building — services, retail, transit arriving at the floorplate',
				promptFragment: 'a ground floor where transit, retail and services arrive directly at the floorplate, the city delivered to the building rather than the reverse'
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
	prompt: 'What else? One idea that the questions above missed.',
	options: [
		{
			key: 'wildcard-open',
			label: 'Wildcard',
			open: true,
			promptFragment: 'one additional idea the table volunteered, unprompted: {text}'
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
// Mirrors the guards in the architecture doc's `questions.draft.ts`.

// V4 folds the era question into the lens screen's chip (`era.ts`), so the
// set opens at q2. `q1` survives only as the chip's stored row id.
if (QUESTIONS.length !== 10) {
	throw new Error(`expected exactly 10 questions (q2..q11), got ${QUESTIONS.length}`);
}
if (!QUESTIONS.every((q, i) => q.id === `q${i + 2}`)) {
	throw new Error('questions are not in brief order q2..q11');
}

const q11 = QUESTIONS[9];
if (q11.options.length !== 8) {
	throw new Error(`Q11 must have exactly 8 options per the brief, got ${q11.options.length}`);
}
if (q11.select.kind !== 'pick' || q11.select.n !== 3) {
	throw new Error('Q11 must be select: { kind: "pick", n: 3 } per the brief');
}

// V3 has five ◆ questions (q2, q4, q7, q9, q10) — up from three. Only q2 and
// q10 also carry `pushCapturesReply`: V3 gives them a generic "Push:" line
// to double as a capture field. q4 and q9 are diamond and DO capture free
// text, just through `open` facet options instead (V3 gives them no
// generic push line); q7 is diamond and spoken-only, no capture at all.
const DIAMOND_IDS = QUESTIONS.filter((q) => q.diamond).map((q) => q.id);
const PUSH_CAPTURE_IDS = QUESTIONS.filter((q) => q.pushCapturesReply).map((q) => q.id);
if (DIAMOND_IDS.join(',') !== 'q2,q4,q7,q9,q10') {
	throw new Error(`expected diamond (◆) questions q2,q4,q7,q9,q10 per V3, got ${DIAMOND_IDS.join(',')}`);
}
if (PUSH_CAPTURE_IDS.join(',') !== 'q2,q10') {
	throw new Error(`expected push-capturing questions q2,q10 per V3, got ${PUSH_CAPTURE_IDS.join(',')}`);
}

if (PROPOSED_QUESTIONS.length !== 1) {
	throw new Error(`expected exactly 1 proposed question (q12) per V3, got ${PROPOSED_QUESTIONS.length}`);
}
if (!(PROPOSED_QUESTIONS[0].id === 'q12' && PROPOSED_QUESTIONS[0].proposed === true)) {
	throw new Error('the one proposed question must be q12, marked proposed: true');
}
if (ACTIVE_QUESTIONS.length !== (ENABLE_PROPOSED_QUESTIONS ? 11 : 10)) {
	throw new Error(`ACTIVE_QUESTIONS length does not match ENABLE_PROPOSED_QUESTIONS (got ${ACTIVE_QUESTIONS.length})`);
}
