/**
 * NOBODY ANSWERS THE SAME QUESTION TWICE.
 *
 * `resumeIndex` always knew where a table had got to — a dead phone replaced
 * mid-session lands on the right screen and always has. The two ways back
 * INTO the flow did not use it:
 *
 *   the landing's "Pick up where you left off" called `next()`, which is the
 *   landing's neighbour — so a table four questions in that walked Back to
 *   the start was asked the lens again, and everything after it
 *
 *   the done screen's "Edit answers" jumped to `future`, the first question,
 *   making a SUBMITTED table re-walk all five screens to change one line
 *
 * Both are about the same promise, so they are tested together.
 */
import { describe, expect, it } from 'vitest';
import { createTableState, resumeIndex, type TableStatus } from './table.svelte';
import { FUTURE_ID, V4_IDS } from '$lib/game/questions';

function status(over: Partial<TableStatus> = {}): TableStatus {
	return {
		table: 4,
		future: null,
		era: null,
		answers: [],
		prompt: '',
		promptEdited: false,
		promptEditable: false,
		images: [],
		narrative: null,
		closed: false,
		gateReason: '',
		submittedAt: null,
		...over
	} as TableStatus;
}

const answer = (questionId: string) => ({ questionId, keys: ['x'] });

describe('picking up where a table left off', () => {
	it('lands on the first UNANSWERED question, not the first question', () => {
		const partly = status({ answers: [answer(FUTURE_ID), answer(V4_IDS[0])] });
		const flow = createTableState(partly);
		// Walk back to the very start, the way a table reading back does.
		while (flow.canGoBack) flow.back();
		expect(flow.step.kind).toBe('landing');

		flow.resume();
		// The next thing it has NOT answered — never the lens it already chose.
		expect(flow.step.kind).toBe('question');
		expect(flow.step.kind === 'question' && flow.step.id).toBe(V4_IDS[1]);
	});

	it('still begins at the beginning for a table that has answered nothing', () => {
		const flow = createTableState(status());
		expect(flow.step.kind).toBe('landing');
		flow.resume();
		expect(flow.step.kind).toBe('future');
	});

	it('sends a fully answered table to review rather than round again', () => {
		const all = status({ answers: [answer(FUTURE_ID), ...V4_IDS.map(answer)] });
		expect(resumeIndex(all)).toBe(resumeIndex(all)); // stable
		const flow = createTableState(all);
		expect(flow.step.kind).toBe('review');
	});

	it('a submitted table resumes onto its picture, not into the questions', () => {
		const submitted = status({
			answers: [answer(FUTURE_ID), ...V4_IDS.map(answer)],
			submittedAt: Date.now(),
			images: [{ zoneKey: 'workspace', state: 'stored', url: '/x.jpg', error: null }]
		});
		const flow = createTableState(submitted);
		expect(flow.step.kind).toBe('images');
	});
});
