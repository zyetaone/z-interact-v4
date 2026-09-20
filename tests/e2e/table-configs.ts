import type { TableAnswers } from './pages/table.page';

/**
 * Three tables' answers on the VERSION 4 set, transcribed onto the exact
 * option labels in `src/lib/game/questions.ts` (her text verbatim, so a
 * label that drifts fails here by name). The era stays at each lens's chip
 * default. Table 1 and table 3 share content and differ only in lens, so
 * the run isolates the lens layer; table 2 takes the other end of every
 * spectrum. Every table answers one "And:" chip and leaves one blank, so
 * the optional path is exercised both ways.
 */
export const TABLE_1: TableAnswers = {
	table: 1,
	future: 'The dense and lit city',
	questions: [
		{
			id: 'q2',
			labels: ['Deep and low-lit — near-black and charcoal; smoked glass, blackened metal, dark timber; sleek and shadowed'],
			and: 'Compressed'
		},
		{
			id: 'q3',
			labels: [
				'The building that expected you — light warms toward your zone, acoustics soften, thresholds change underfoot, and the room is already cooled, lit and set up'
			],
			and: 'On the journey'
		},
		{
			id: 'q4w',
			labels: ['The cockpit — a curve of screens and surfaces wrapping around you. You and your AI, fully instrumented, working at speed.'],
			and: 'Your state'
		},
		{
			id: 'q5c',
			labels: ['The cockpit — one person flying with full AI power; data and options surround them, they steer'],
			and: 'On the surfaces'
		},
		{
			id: 'q6r',
			labels: [
				"Deep Sea — your certainty is spent — you've been sharp too long and stopped trusting your gut. Blue dark, weightless, muffled, slow drift. You recover by stopping thought entirely."
			]
		},
		{ id: 'q7', labels: ['Screens everywhere, always on — displays, dashboards and data visible across the floor at all times.'] },
		{ id: 'q8', labels: ['Sparse inside, abundant outside — the greenery is beyond the glass'] },
		{ id: 'q10', labels: ['It adapts — we made everything movable, and accepted that nothing feels permanent or owned'], and: 'A' },
		{ id: 'q11', labels: ['Electric', 'Focused', 'Alive'] }
	],
	wildcard: 'a glass bridge between two towers'
};

export const TABLE_2: TableAnswers = {
	table: 2,
	future: 'The garden city',
	questions: [
		{
			id: 'q2',
			labels: ['Warm and earthy — terracotta, clay, olive, bronze; rammed earth, rattan, aged brass, linen; woven and textured'],
			and: 'Human'
		},
		{ id: 'q3', labels: ['The human welcome — a person is waiting; they greet you, walk you in, hand you over'] },
		{
			id: 'q4w',
			labels: [
				'A room of your own — four walls, a door you close, a window. Yours, with your things in it. The highest-performing answer in the research, and the most expensive.'
			],
			and: 'Nothing'
		},
		{
			id: 'q5c',
			labels: ['The thinking walk — not a room; a loop through garden, water or sky, AI in the ear only when called'],
			and: 'Unseen'
		},
		{
			id: 'q6r',
			labels: [
				"Old Forest — your thinking is spent — you've decided too much. Tall trunks, filtered light, long quiet views, no one talking. You recover by thinking slowly, alone."
			],
			and: 'The real thing'
		},
		{ id: 'q7', labels: ['Paper and pens on purpose — whiteboards, pinboards, printouts. Deliberately unplugged zones where nothing is recorded.'] },
		{ id: 'q8', labels: ['Nature as structure — terraces and open-air floors; the building is the garden'] },
		{ id: 'q10', labels: ['It protects attention — we made it quiet and enclosed, and accepted that it feels less buzzy'] },
		{ id: 'q11', labels: ['Calm', 'Sacred', 'Yours'] }
	],
	wildcard: 'a library with a stream running through it'
};

/** Same content as table 1, lens swapped to the warm machine age — isolates the lens layer. */
export const TABLE_3: TableAnswers = {
	...TABLE_1,
	table: 3,
	future: 'The warm machine age'
};

export const ALL_TABLES = [TABLE_1, TABLE_2, TABLE_3];
