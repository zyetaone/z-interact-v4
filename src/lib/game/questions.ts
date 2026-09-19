/**
 * QUESTION SET — the 11 questions + wildcard (BRIEF.md §"The 11 questions",
 * 18 Sep, verbatim). Every `label` is copied exactly, including the ◆ flags
 * (as `diamond: boolean`, Q2/Q5/Q9) and the "Push:" lines (as `push`,
 * presenter prompts, not form fields — three of them double as a typed
 * capture field via `pushCapturesReply`, matching the ◆ questions).
 *
 * Fixed interface the plumbing builds against (routes, `answers.remote.ts`,
 * `prompt.ts`'s programme layer): an ordered `QUESTIONS` array, each with a
 * stable `id` (used as the D1 `answers.question_id` and never renumbered —
 * renumbering would orphan already-saved rows) and options, plus an
 * optional free-text wildcard question.
 *
 * Type extensions beyond the original stub (documented per the brief):
 * `layer` gained `'mood'` (Q1 feeds the mood/era layer, which the original
 * 3-value union had no slot for); `Question` gained `select` (Q6/Q10 are
 * multi-select, Q11 is pick-three-of-eight, the rest are single-select),
 * `diamond`, `push` and `pushCapturesReply`; `QuestionOption` gained
 * `promptFragment` (concrete, image-model-readable nouns and materials —
 * the brief's own conference phrasing does not render well) and `open`
 * (an option answered by typing as well as selecting, e.g. Q3's "both, and
 * in what order", Q6/Q9/Q10's "what has disappeared/stays human" fields).
 * `id`s, `TABLE_COUNT`, `WILDCARD`, `TableAnswers` are unchanged.
 */

import { ENABLE_PROPOSED_QUESTIONS } from './config';

export const TABLE_COUNT = 20;

/** How a question is answered — mirrors the brief's own wording, not an invented scale. */
export type SelectKind = { kind: 'one' } | { kind: 'many'; min?: number } | { kind: 'pick'; n: number };

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
	options: QuestionOption[];
	/** Which prompt layer this question's answer feeds (prompt.ts's LayerInputs). */
	layer: 'mood' | 'materialsAndLight' | 'programme' | 'feel';
	select: SelectKind;
	/** The brief's own ◆ — this question's answer drives the drawn visual most. */
	diamond: boolean;
	/** The "Push:" line, verbatim. Shown as a hint under the stem; spoken at the table. */
	push?: string;
	/** True only for the three diamond questions (Q2, Q5, Q9) — the push line doubles
	 *  as a typed capture field there; the other eight stay spoken-only. */
	pushCapturesReply?: boolean;
	/** True only for `PROPOSED_QUESTIONS` (q12, q13) — the question owner has not
	 *  blessed these; they never appear in the flow unless `config.ts`'s
	 *  `ENABLE_PROPOSED_QUESTIONS` is on. Absent (falsy) on every one of the 11. */
	proposed?: boolean;
}

export const QUESTIONS: Question[] = [
	{
		id: 'q1',
		prompt: 'What year is your office living in?',
		layer: 'mood',
		select: { kind: 'one' },
		diamond: false,
		push: 'if "same as 2026," say what you are protecting by refusing to change.',
		options: [
			{
				key: 'hyperfuturistic-2040',
				label: 'Hyper-futuristic 2040',
				promptFragment: 'set in a hyper-futuristic 2040, technology fully integrated and visible throughout the architecture'
			},
			{
				key: 'recognisably-2035',
				label: 'Recognisably 2035',
				promptFragment:
					'set in a recognisably near-future 2035, familiar building bones with a decade of quiet technological refinement'
			},
			{
				key: 'same-as-2026',
				label: 'Deliberately the same as 2026',
				promptFragment: 'deliberately unchanged from 2026, the same desks, the same materials, refusing to date itself'
			},
			{
				key: 'retro-1930s',
				label: 'Retro, 1930s warmth reborn',
				promptFragment:
					'retro-futurist, 1930s warmth reborn — brass fittings, walnut and leather, deco geometry, warm incandescent light'
			}
		]
	},
	{
		id: 'q2',
		prompt: 'What is your material world?',
		layer: 'materialsAndLight',
		select: { kind: 'one' },
		diamond: true,
		push: 'name two materials you would actually touch, not just a colour.',
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
				label: 'Raw and elemental: concrete, stone, timber, texture',
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
		prompt: 'How does a visitor find their way in?',
		layer: 'programme',
		select: { kind: 'one' },
		diamond: false,
		push: 'what is the first thing a visitor sees, hears and smells?',
		options: [
			{
				key: 'ai-wayfinding',
				label: 'AI wayfinding',
				promptFragment: 'AI-guided arrival: an ambient digital concierge orienting the visitor before they consciously look for a sign'
			},
			{
				key: 'human-welcome',
				label: 'A human welcome',
				promptFragment: 'a human welcome at arrival: a staffed reception, a face greeting the visitor first'
			},
			{
				key: 'both-in-order',
				label: 'Both, and in what order',
				open: true,
				promptFragment: 'a layered arrival combining AI guidance and a human welcome, in an order the table specifies: {text}'
			},
			{
				key: 'greets-before-door',
				label: 'Something that greets you before you reach the door',
				promptFragment:
					'an arrival that greets the visitor before the door itself — light, sound or motion sensing approach from outside'
			}
		]
	},
	{
		id: 'q4',
		prompt: 'How do employees move through the space?',
		layer: 'programme',
		select: { kind: 'one' },
		diamond: false,
		options: [
			{
				key: 'ai-voice-guide',
				label: 'AI voice guide',
				promptFragment: 'movement guided by an ambient AI voice, no visible signage needed'
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
				label: 'Your space finds you rather than you finding it',
				promptFragment: 'a space that finds the person rather than the reverse — desks, rooms or zones reconfiguring toward them'
			}
		]
	},
	{
		id: 'q5',
		prompt: 'Which features protect attention?',
		layer: 'materialsAndLight',
		select: { kind: 'one' },
		diamond: true,
		push: 'name one place for two hours of uninterrupted thought, and one place for recovering afterwards.',
		pushCapturesReply: true,
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
				key: 'null-zones',
				label: 'Null zones with no signal at all',
				promptFragment: 'a null zone with no signal at all — deliberately unconnected, unmarked, a room the network does not reach'
			},
			{
				key: 'acoustic-cores',
				label: 'Acoustic sub-35dB cores',
				promptFragment: 'an acoustic core rated below 35 decibels, dense sound-absorbing surfaces, near silence'
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
		layer: 'programme',
		select: { kind: 'one' },
		diamond: false,
		push: 'where in your office is there visibly no technology, on purpose?',
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
				label: 'Tech you only notice when you need it',
				promptFragment: 'technology fully hidden until needed, surfaces reading as ordinary until activated'
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
		prompt: 'How does the building sense and learn?',
		layer: 'programme',
		select: { kind: 'one' },
		diamond: true,
		push: 'describe one visible moment where the space adapts to a person.',
		pushCapturesReply: true,
		options: [
			{
				key: 'reads-occupancy-noise-air-light-mood',
				label: 'It reads occupancy, noise, air, light, mood',
				promptFragment: 'a building visibly instrumented to read occupancy, noise, air quality, light and mood in real time'
			},
			{
				key: 'learns-rhythms-over-weeks',
				label: 'It learns your rhythms over weeks',
				promptFragment: "a building that has learned a person's rhythms over weeks, subtly anticipating their arrival"
			},
			{
				key: 'adjusts-before-you-ask',
				label: 'It adjusts climate, sound or layout before you ask',
				promptFragment: 'a building adjusting climate, sound or layout a moment before it is asked to, visibly mid-adjustment'
			},
			{
				key: 'shows-what-it-knows',
				label: 'It shows you what it knows',
				promptFragment: 'a building that visibly displays what it senses — a panel or surface showing live readings back to the room'
			},
			{
				key: 'chooses-not-to-watch',
				label: 'Where it deliberately chooses not to watch',
				open: true,
				promptFragment:
					'one room the building deliberately does not sense or record, specified by the table: {text}, conspicuously unmonitored'
			}
		]
	},
	{
		id: 'q10',
		prompt: 'What runs itself, and what stays human?',
		layer: 'programme',
		select: { kind: 'many', min: 1 },
		diamond: false,
		push: 'name the one thing your table refused to automate.',
		options: [
			{
				key: 'autonomous-systems',
				label: 'Energy, climate, cleaning, security, booking, catering: which are fully autonomous',
				promptFragment:
					'visible fully autonomous building systems at work — climate, cleaning or security operating with no human hand'
			},
			{
				key: 'robots-visible-or-hidden',
				label: 'Robots visible or hidden',
				promptFragment: 'service robots present, either visibly moving through the space or working out of sight'
			},
			{
				key: 'decision-always-human',
				label: 'What decision must a person always make',
				open: true,
				promptFragment: 'a room built around one decision a person always makes, specified by the table: {text}, visibly human-held'
			},
			{
				key: 'humans-ai-decide-together',
				label: 'Where humans and AI sit together and decide something hard',
				promptFragment: 'a setting built for humans and AI deciding something hard together — shared table, shared display, both present'
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
 * PROPOSED QUESTIONS — game-flow.md §7's two proposals for the question
 * owner ("workstation ↔ urban alignment", "how teams form"). Proposals
 * only: never in `QUESTIONS` itself (which stays fixed at 11 and keeps its
 * own q1..q11 shape guards below), and never in the active flow unless
 * `config.ts`'s `ENABLE_PROPOSED_QUESTIONS` is on. `layers.ts` maps q12
 * into the programme layer's urban-edge/ground-plane clause and q13 into a
 * short "teams" clause, both gated the same way.
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
	},
	{
		id: 'q13',
		prompt: 'How does a team come together to do the work?',
		layer: 'programme',
		select: { kind: 'one' },
		diamond: false,
		proposed: true,
		push: 'name the decision your table would never let the AI half of a centaur make.',
		options: [
			{
				key: 'standing-team-for-years',
				label: 'A standing team that stays together for years',
				promptFragment: 'a long-standing team with assigned desks clustered together, the same faces year over year'
			},
			{
				key: 'agile-squads-dissolve',
				label: 'Agile squads that form for a sprint and dissolve',
				promptFragment: 'a temporary squad clustered around a shared table and whiteboard, furniture built to be reconfigured once the sprint ends'
			},
			{
				key: 'centaur-pairing',
				label: 'One person plus their AI, a centaur pairing, as the default unit',
				promptFragment: 'a single-person workstation paired with one dedicated screen for an AI collaborator, the two visibly a working pair'
			},
			{
				key: 'human-core-ai-specialists',
				label: 'A human core with AI specialists pulled in per task',
				promptFragment: 'a small human core desk cluster with satellite screens for AI specialists pulled in only when a task needs them'
			},
			{
				key: 'team-assembles-itself',
				label: 'The team assembles itself: the work names who it needs and they arrive',
				promptFragment: 'a flexible assembly area where seats and screens configure themselves as newly summoned people arrive for one task'
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

if (QUESTIONS.length !== 11) {
	throw new Error(`expected exactly 11 questions, got ${QUESTIONS.length}`);
}
if (!QUESTIONS.every((q, i) => q.id === `q${i + 1}`)) {
	throw new Error('questions are not in brief order q1..q11');
}

const q11 = QUESTIONS[10];
if (q11.options.length !== 8) {
	throw new Error(`Q11 must have exactly 8 options per the brief, got ${q11.options.length}`);
}
if (q11.select.kind !== 'pick' || q11.select.n !== 3) {
	throw new Error('Q11 must be select: { kind: "pick", n: 3 } per the brief');
}

const DIAMOND_IDS = QUESTIONS.filter((q) => q.diamond).map((q) => q.id);
const PUSH_CAPTURE_IDS = QUESTIONS.filter((q) => q.pushCapturesReply).map((q) => q.id);
if (DIAMOND_IDS.join(',') !== PUSH_CAPTURE_IDS.join(',')) {
	throw new Error('diamond questions and push-capturing questions have drifted apart');
}
if (DIAMOND_IDS.length !== 3) {
	throw new Error(`expected exactly 3 diamond (◆) questions, got ${DIAMOND_IDS.length}`);
}

if (PROPOSED_QUESTIONS.length !== 2) {
	throw new Error(`expected exactly 2 proposed questions, got ${PROPOSED_QUESTIONS.length}`);
}
if (!PROPOSED_QUESTIONS.every((q, i) => q.id === `q${12 + i}` && q.proposed === true)) {
	throw new Error('proposed questions must be q12, q13, each marked proposed: true');
}
if (ACTIVE_QUESTIONS.length !== (ENABLE_PROPOSED_QUESTIONS ? 13 : 11)) {
	throw new Error(`ACTIVE_QUESTIONS length does not match ENABLE_PROPOSED_QUESTIONS (got ${ACTIVE_QUESTIONS.length})`);
}
