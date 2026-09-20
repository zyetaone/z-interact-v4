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
	/** True only for `PROPOSED_QUESTIONS` (q12) — the question owner has not
	 *  blessed this; it never appears in the flow unless `config.ts`'s
	 *  `ENABLE_PROPOSED_QUESTIONS` is on. Absent (falsy) on every one of the nine. */
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
				label:
					'Deep and low-lit — near-black and charcoal; smoked glass, blackened metal, dark timber; sleek and shadowed',
				promptFragment:
					'near-black and charcoal; smoked glass, blackened metal, dark timber; sleek and shadowed'
			},
			{
				key: 'stark-clinical',
				label: 'Stark and clinical — pure white, shadowless; seamless resin, glass, polished steel; shiny and flawless',
				promptFragment:
					'pure white and shadowless; seamless resin, glass, polished steel; shiny and flawless'
			},
			{
				key: 'soft-pastel',
				label: 'Soft and pastel — blush, sage, butter; felt, bouclé, painted timber, matte ceramic; soft and tactile',
				promptFragment:
					'blush, sage and butter; felt, bouclé, painted timber, matte ceramic; soft and tactile'
			},
			{
				key: 'raw-elemental',
				label:
					'Raw and elemental — grey, sand, ochre; board-marked concrete, stone, rough timber; rugged and unpolished',
				promptFragment:
					'grey, sand and ochre; board-marked concrete, stone, rough timber; rugged and unpolished'
			},
			{
				key: 'warm-earthy',
				label:
					'Warm and earthy — terracotta, clay, olive, bronze; rammed earth, rattan, aged brass, linen; woven and textured',
				promptFragment:
					'terracotta, clay, olive and bronze; rammed earth, rattan, aged brass, linen; woven and textured'
			},
			{
				key: 'jewel-lacquer',
				label: 'Jewel and lacquer — emerald, oxblood on black; lacquered wood, velvet, marble, brass; glossy and deep',
				promptFragment:
					'emerald and oxblood on black; lacquered wood, velvet, marble, brass; glossy and deep'
			},
			{
				key: 'undersea',
				label:
					'Undersea — teal and deep blue-green, light rippling from above; curved glass, wet-look surfaces; fluid and slick',
				promptFragment:
					'teal and deep blue-green, light rippling from above; curved glass, wet-look surfaces; fluid and slick'
			}
		],
		and: {
			prompt: 'what scale?',
			options: [
				{
					key: 'cathedral',
					label: 'Cathedral',
					promptFragment: 'wide lens, low, a tall volume overhead'
				},
				{
					key: 'generous',
					label: 'Generous',
					promptFragment: 'wide lens, high ceilings, open floor'
				},
				{
					key: 'human',
					label: 'Human',
					promptFragment: '50 mm, eye level, ceilings within reach'
				},
				{
					key: 'nested',
					label: 'Nested',
					promptFragment: 'medium lens from an alcove, the hall beyond'
				},
				{
					key: 'compressed',
					label: 'Compressed',
					promptFragment: 'tight framing at eye level, close walls'
				}
			]
		}
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
				key: 'human-welcome',
				label: 'The human welcome — a person is waiting; they greet you, walk you in, hand you over',
				promptFragment:
					'a person waiting at the threshold to greet and walk visitors in'
			},
			{
				key: 'explains-itself',
				label:
					"The building that explains itself — sightlines, landmarks, distinct zones. No signage, no screens, no visual clutter — nothing to read, because there's nothing you need to be told",
				promptFragment:
					'long clear sightlines, landmarks, distinct zones, no signage, no screens'
			},
			{
				key: 'guided-path',
				label: 'The guided path — directories, dynamic screens and signage that update as you move',
				promptFragment: 'directories, dynamic screens and signage updating as people move'
			},
			{
				key: 'virtual-companion',
				label: "The virtual companion — a personal AI knows where you're headed; it speaks only when you hesitate",
				promptFragment:
					'no signage, a visitor with an earpiece pausing to listen'
			},
			{
				key: 'expected-you',
				label:
					'The building that expected you — light warms toward your zone, acoustics soften, thresholds change underfoot, and the room is already cooled, lit and set up',
				promptFragment:
					'light warming toward one zone, thresholds changing underfoot, the room already set'
			}
		],
		and: {
			prompt: "when does it know you're coming?",
			options: [
				{
					key: 'never',
					label: 'Never',
					promptFragment: 'a plain unlit threshold that reacts to no one'
				},
				{
					key: 'at-the-door',
					label: 'At the door',
					promptFragment: 'a threshold lighting and opening as someone reaches the door'
				},
				{
					key: 'on-the-journey',
					label: 'On the journey',
					promptFragment: 'a route lighting ahead of the visitor'
				},
				{
					key: 'yesterday',
					label: 'Yesterday',
					promptFragment: 'a room set and named for the visitor since yesterday'
				}
			]
		}
	},
	{
		id: 'q4w',
		prompt: 'What does your workstation look like?',
		lead: 'Where one person and their AI actually sit. Research point: enclosure and quiet measurably improve thinking. Private rooms outperform everything. The open bench with a low screen performs worst.',
		layer: 'programme',
		select: { kind: 'one' },
		diamond: true,
		push: "if the research says private rooms win, why doesn't your office have them?",
		options: [
			{
				key: 'room-of-your-own',
				label:
					'A room of your own — four walls, a door you close, a window. Yours, with your things in it. The highest-performing answer in the research, and the most expensive.',
				promptFragment: 'a private room: four walls, a door, a window, personal things'
			},
			{
				key: 'deep-desk',
				label:
					'The deep desk — a metre-plus deep, tall acoustic panels on three sides, one large screen. Nearly a room, without the door.',
				promptFragment:
					'a metre-deep desk, tall acoustic panels on three sides, one large screen'
			},
			{
				key: 'cockpit',
				label:
					'The cockpit — a curve of screens and surfaces wrapping around you. You and your AI, fully instrumented, working at speed.',
				promptFragment:
					'a cockpit desk, a curve of screens and surfaces wrapping one seat'
			},
			{
				key: 'pod',
				label:
					'The pod — a sealed acoustic booth you book and leave. Remote colleagues appear beside you. Small, glazed, temporary.',
				promptFragment:
					'a small glazed acoustic pod, a remote colleague appearing on its glass'
			},
			{
				key: 'open-bench',
				label:
					'The open bench — a shared surface, no panels, no ownership. Focus happens elsewhere; this is for being together.',
				promptFragment: 'a long shared open bench, no panels, people side by side'
			},
			{
				key: 'no-workstation',
				label: 'No workstation at all — you carry your work. The building offers settings, not desks.',
				promptFragment:
					'no desks, only settings: window seats, soft corners, high tables'
			}
		],
		and: {
			prompt: 'how much does it know about you?',
			options: [
				{
					key: 'nothing',
					label: 'Nothing',
					promptFragment: 'no visible technology at the desk'
				},
				{
					key: 'your-settings',
					label: 'Your settings',
					promptFragment: 'one indicator light, the desk already adjusted'
				},
				{
					key: 'your-patterns',
					label: 'Your patterns',
					promptFragment:
						'a faint schedule glowing on the desk'
				},
				{
					key: 'your-state',
					label: 'Your state',
					promptFragment:
						'light and air shifting around the occupant'
				}
			]
		}
	},
	{
		id: 'q5c',
		prompt: 'Where does deep work happen in a centaur organisation?',
		lead: 'AI brings speed, pattern and scale. People bring judgement, ethics, creativity and context.',
		layer: 'programme',
		select: { kind: 'one' },
		diamond: true,
		push: 'what did your table refuse to automate?',
		pushCapturesReply: true,
		pushNotDrawn: true,
		options: [
			{
				key: 'sealed-cell',
				label:
					'The sealed cell — one person, no AI in the room. No signal, no prompts, deliberately unassisted thought.',
				promptFragment:
					'a sealed cell for one: no AI, no screens, a desk, paper, a window'
			},
			{
				key: 'cockpit',
				label: 'The cockpit — one person flying with full AI power; data and options surround them, they steer',
				promptFragment:
					'a cockpit for one, data and options on wraparound surfaces'
			},
			{
				key: 'quiet-pair',
				label: 'The quiet pair — two people thinking together; AI listens, captures, retrieves, never interrupts',
				promptFragment:
					'two people thinking together, one small discreet device listening'
			},
			{
				key: 'judgement-room',
				label:
					'The judgement room — a small group making a hard call; AI laid out the evidence, the decision stays in the room',
				promptFragment:
					'a small group making a hard call, evidence on the walls'
			},
			{
				key: 'studio',
				label: 'The studio — a team creating with AI generating alongside them; messy, visual, fast',
				promptFragment:
					'a messy visual studio, a team creating, walls covered in fast iterations'
			},
			{
				key: 'thinking-walk',
				label: 'The thinking walk — not a room; a loop through garden, water or sky, AI in the ear only when called',
				promptFragment:
					'a loop through garden, water or sky, one walker with an earpiece'
			}
		],
		and: {
			prompt: 'where does the AI sit?',
			options: [
				{
					key: 'unseen',
					label: 'Unseen',
					promptFragment: 'the AI unseen, no device anywhere'
				},
				{
					key: 'in-the-light',
					label: 'In the light',
					promptFragment: 'the AI present only as light'
				},
				{
					key: 'on-the-surfaces',
					label: 'On the surfaces',
					promptFragment: 'the AI on the walls and tables'
				},
				{
					key: 'in-the-room',
					label: 'In the room',
					promptFragment: 'a hologram or figure at the table'
				}
			]
		}
	},
	{
		id: 'q6r',
		prompt: 'Where do people recharge?',
		lead: 'Not all tiredness is the same. Four kinds of depletion, four ways back.',
		layer: 'programme',
		select: { kind: 'one' },
		diamond: true,
		push: 'which of the four is your organisation actually short of?',
		options: [
			{
				key: 'grassland',
				label:
					"Grassland — your body is spent — you've been still too long. Open horizon, sky, wind, room to move. You recover by walking, stretching, being outside.",
				promptFragment: 'grassland: open horizon, sky and wind, room to walk and stretch'
			},
			{
				key: 'old-forest',
				label:
					"Old Forest — your thinking is spent — you've decided too much. Tall trunks, filtered light, long quiet views, no one talking. You recover by thinking slowly, alone.",
				promptFragment:
					'old forest: tall trunks, filtered light, long quiet views, no one talking'
			},
			{
				key: 'rain-forest',
				label:
					"Rain Forest — your patience is spent — you've given too much to other people. Warm, dense, alive with sound. You recover among people who ask nothing of you.",
				promptFragment: 'rain forest: warm, dense, alive with sound, people nearby who ask nothing'
			},
			{
				key: 'deep-sea',
				label:
					"Deep Sea — your certainty is spent — you've been sharp too long and stopped trusting your gut. Blue dark, weightless, muffled, slow drift. You recover by stopping thought entirely.",
				promptFragment:
					'deep sea: blue dark, weightless, muffled, slow drifting light'
			}
		],
		and: {
			prompt: 'how far does it go?',
			options: [
				{
					key: 'a-view-of-it',
					label: 'A view of it',
					promptFragment: 'only a view through the far glass'
				},
				{
					key: 'a-room-that-evokes-it',
					label: 'A room that evokes it',
					promptFragment: 'an interior room borrowing its light and material'
				},
				{
					key: 'fully-immersive',
					label: 'Fully immersive',
					promptFragment: 'the biome filling the frame, floor to ceiling'
				},
				{
					key: 'the-real-thing',
					label: 'The real thing',
					promptFragment: 'outdoors inside it, the building at the edge'
				}
			]
		}
	},
	{
		id: 'q7',
		prompt: 'Is the technology obvious or invisible?',
		layer: 'materialsAndLight',
		select: { kind: 'one' },
		diamond: false,
		push: 'where is there visibly no technology, on purpose?',
		options: [
			{
				key: 'nothing-to-see',
				label: "Nothing to see — no screens, no devices, no hardware anywhere. It works, but you couldn't point at it.",
				promptFragment:
					'no screens, no devices, no hardware anywhere'
			},
			{
				key: 'light-and-sound',
				label:
					'Light and sound do the talking — no screens. The room communicates by warming, dimming, quieting or cooling.',
				promptFragment:
					'no screens; the room warming, dimming or cooling instead'
			},
			{
				key: 'surfaces-wake-up',
				label:
					'Surfaces wake up — walls, glass and tables are blank until needed, then become displays, then go blank again.',
				promptFragment:
					'walls and tables blank until needed, one surface awake'
			},
			{
				key: 'screens-everywhere',
				label: 'Screens everywhere, always on — displays, dashboards and data visible across the floor at all times.',
				promptFragment: 'screens everywhere, always on, dashboards across the floor'
			},
			{
				key: 'has-a-body',
				label:
					"It has a body — a hologram, avatar or robot with physical presence. You speak to it, and it's in the room with you.",
				promptFragment:
					'a hologram or robot with physical presence in the room'
			},
			{
				key: 'paper-and-pens',
				label:
					'Paper and pens on purpose — whiteboards, pinboards, printouts. Deliberately unplugged zones where nothing is recorded.',
				promptFragment:
					'paper and pens on purpose: whiteboards, pinboards, printouts'
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
				key: 'sparse-inside-abundant-outside',
				label: 'Sparse inside, abundant outside — the greenery is beyond the glass',
				promptFragment: 'sparse planting inside, abundant greenery beyond the glass'
			},
			{
				key: 'deliberate-pockets',
				label: 'Pockets — deliberate, placed moments of planting',
				promptFragment: 'deliberate pockets of greenery'
			},
			{
				key: 'saturated',
				label: 'Saturated — greenery threaded through the entire floor',
				promptFragment: 'greenery threaded through the entire floor'
			},
			{
				key: 'landscape-indoors',
				label: 'Landscape indoors — trees, water, rock and soil you can walk into',
				promptFragment: 'trees, water, rock and soil indoors'
			},
			{
				key: 'nature-as-structure',
				label: 'Nature as structure — terraces and open-air floors; the building is the garden',
				promptFragment: 'planted terraces and open-air floors, the building a garden'
			}
		]
	},
	{
		id: 'q10',
		prompt: 'Your workplace can be brilliant at one of these. Which did you choose?',
		layer: 'feel',
		select: { kind: 'one' },
		diamond: true,
		push: 'be ready to point at the exact place in your image where your choice is visible.',
		options: [
			{
				key: 'protects-attention',
				label: 'It protects attention — we made it quiet and enclosed, and accepted that it feels less buzzy',
				promptFragment: 'more small quiet rooms than open floor'
			},
			{
				key: 'supports-judgement',
				label: 'It supports judgement — we built space for hard conversations, and gave up floor area to do it',
				promptFragment:
					'one oversized room built for a hard decision'
			},
			{
				key: 'adapts-as-needs-change',
				label: 'It adapts — we made everything movable, and accepted that nothing feels permanent or owned',
				promptFragment: 'the same furniture set up two different ways in view'
			},
			{
				key: 'knows-when-to-step-back',
				label: 'It knows when to step back — we kept AI out of some places on purpose, and gave up efficiency there',
				promptFragment:
					'half the floor visibly unpowered, nothing switched on'
			}
		],
		and: {
			prompt: 'which one did you find hardest?',
			options: [
				{
					key: 'a',
					label: 'Protects attention',
					promptFragment: 'the hardest trade-off was protecting attention'
				},
				{
					key: 'b',
					label: 'Supports judgement',
					promptFragment: 'the hardest trade-off was supporting judgement'
				},
				{
					key: 'c',
					label: 'Adapts',
					promptFragment: 'the hardest trade-off was adapting'
				},
				{
					key: 'd',
					label: 'Steps back',
					promptFragment: 'the hardest trade-off was knowing when to step back'
				}
			]
		}
	},
	{
		id: 'q11',
		prompt: 'In three words, what should it feel like?',
		layer: 'feel',
		select: { kind: 'pick', n: 3 },
		diamond: false,
		options: [
			{ key: 'calm', label: 'Calm', promptFragment: 'soft even light, still air' },
			{ key: 'electric', label: 'Electric', promptFragment: 'hard rim light, reflections, motion blur' },
			{ key: 'sacred', label: 'Sacred', promptFragment: 'one high shaft of light, silence' },
			{ key: 'playful', label: 'Playful', promptFragment: 'colour accents, a tilted frame' },
			{ key: 'focused', label: 'Focused', promptFragment: 'one pool of light, shadow around' },
			{ key: 'alive', label: 'Alive', promptFragment: 'leaves, water and birds moving' },
			{ key: 'effortless', label: 'Effortless', promptFragment: 'nothing in the way' },
			{ key: 'quiet', label: 'Quiet', promptFragment: 'deep shadow, an empty foreground' },
			{ key: 'generous', label: 'Generous', promptFragment: 'wide and tall, open air' },
			{ key: 'yours', label: 'Yours', promptFragment: 'one personal object in the foreground' }
		]
	}
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
	prompt: 'What have we missed?',
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

/** V4's nine, in her order; q1 is the lens screen's era chip, never a question. */
export const V4_IDS = ['q2', 'q3', 'q4w', 'q5c', 'q6r', 'q7', 'q8', 'q10', 'q11'] as const;

if (QUESTIONS.map((q) => q.id).join(',') !== V4_IDS.join(',')) {
	throw new Error(
		`questions are not V4's set in her order (${V4_IDS.join(',')}), got ${QUESTIONS.map((q) => q.id).join(',')}`
	);
}

const q11 = QUESTIONS[QUESTIONS.length - 1];
if (q11.options.length !== 10) {
	throw new Error(`V4's three-words question must have exactly 10 options, got ${q11.options.length}`);
}
if (q11.select.kind !== 'pick' || q11.select.n !== 3) {
	throw new Error('the three-words question must be select: { kind: "pick", n: 3 } per the brief');
}

// V4 has five ◆ questions (Q2, Q4, Q5, Q6, Q9 -> q2, q4w, q5c, q6r, q10).
// Only q2 and q5c carry `pushCapturesReply` — see the module note.
const DIAMOND_IDS = QUESTIONS.filter((q) => q.diamond).map((q) => q.id);
const PUSH_CAPTURE_IDS = QUESTIONS.filter((q) => q.pushCapturesReply).map((q) => q.id);
if (DIAMOND_IDS.join(',') !== 'q2,q4w,q5c,q6r,q10') {
	throw new Error(`expected diamond (◆) questions q2,q4w,q5c,q6r,q10 per V4, got ${DIAMOND_IDS.join(',')}`);
}
if (PUSH_CAPTURE_IDS.join(',') !== 'q2,q5c') {
	throw new Error(`expected push-capturing questions q2,q5c per V4, got ${PUSH_CAPTURE_IDS.join(',')}`);
}

// V4's six "And:" sub-questions, on exactly these.
const AND_IDS = QUESTIONS.filter((q) => q.and).map((q) => q.id);
if (AND_IDS.join(',') !== 'q2,q3,q4w,q5c,q6r,q10') {
	throw new Error(`expected "And:" sub-questions on q2,q3,q4w,q5c,q6r,q10 per V4, got ${AND_IDS.join(',')}`);
}

if (PROPOSED_QUESTIONS.length !== 1) {
	throw new Error(`expected exactly 1 proposed question (q12), got ${PROPOSED_QUESTIONS.length}`);
}
if (!(PROPOSED_QUESTIONS[0].id === 'q12' && PROPOSED_QUESTIONS[0].proposed === true)) {
	throw new Error('the one proposed question must be q12, marked proposed: true');
}
if (ACTIVE_QUESTIONS.length !== (ENABLE_PROPOSED_QUESTIONS ? 10 : 9)) {
	throw new Error(`ACTIVE_QUESTIONS length does not match ENABLE_PROPOSED_QUESTIONS (got ${ACTIVE_QUESTIONS.length})`);
}
