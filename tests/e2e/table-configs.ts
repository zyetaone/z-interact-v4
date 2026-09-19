import type { TableAnswers } from './pages/table.page';

/**
 * The three tables' answers, transcribed from the assignment brief onto the
 * exact option labels in `src/lib/game/questions.ts`. Q1 is left at the
 * future's chip default for all three tables (brief: "Q1 as the chip
 * default" for table 1; tables 2/3 don't ask for a nudge either).
 *
 * Open-option questions where the brief didn't supply typed text (table 2's
 * Q9 "chooses not to watch" and Q10 "decision a person must make") are left
 * blank on purpose — `fragmentOf` drops the `{text}` slot cleanly, and
 * REPORT.md states this as an assumption.
 */
export const TABLE_1: TableAnswers = {
	table: 1,
	future: 'Neo-Seoul / Cyberpunk',
	questions: [
		{ id: 'q2', labels: ['Deep and low-lit: dark surfaces, pools of warm light'] },
		{ id: 'q3', labels: ['Something that greets you before you reach the door'] },
		{ id: 'q4', labels: ['Light paths in the floor'] },
		{ id: 'q5', labels: ['Null zones with no signal at all'] },
		{ id: 'q6', labels: ['Rooms that change size', 'Furniture that moves itself'] },
		{ id: 'q7', labels: ['Walls that become screens'] },
		{ id: 'q8', labels: ['Sparse inside, abundant outside'] },
		{ id: 'q9', labels: ['It shows you what it knows'] },
		{ id: 'q10', labels: ['Robots visible or hidden'] },
		{ id: 'q11', labels: ['Electric', 'Focused', 'Alive'] }
	],
	wildcard: 'a glass bridge between two towers'
};

export const TABLE_2: TableAnswers = {
	table: 2,
	future: 'Garden City',
	questions: [
		{ id: 'q2', labels: ['Raw and elemental: concrete, stone, timber, texture'] },
		{ id: 'q3', labels: ['A human welcome'] },
		{ id: 'q4', labels: ['No signage at all, because the layout is obvious'] },
		{ id: 'q5', labels: ['Glass domes in gardens'] },
		{ id: 'q6', labels: ['Meeting in gardens, on stairs, while walking'] },
		{ id: 'q7', labels: ['Deliberately analogue zones'] },
		{ id: 'q8', labels: ['Full rainforest indoors'] },
		{ id: 'q9', labels: ['Where it deliberately chooses not to watch'] },
		{ id: 'q10', labels: ['What decision must a person always make'] },
		{ id: 'q11', labels: ['Calm', 'Sacred', 'Yours'] }
	],
	wildcard: 'a library with a stream running through it'
};

/** Same content as table 1, future swapped to Retrofuturism — isolates the future layer. */
export const TABLE_3: TableAnswers = {
	...TABLE_1,
	table: 3,
	future: 'Retrofuturism'
};

export const ALL_TABLES = [TABLE_1, TABLE_2, TABLE_3];
