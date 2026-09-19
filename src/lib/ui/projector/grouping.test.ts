/**
 * The lens survives on the wall as order and colour only, so the ordering
 * is now load-bearing: it is the entire remaining trace of the grouping
 * the reveal used to spell out in headings.
 */
import { describe, expect, it } from 'vitest';
import { FUTURES } from '$lib/game/futures';
import { byLensThenTable, futureIndexOf, stillAnswering } from './grouping';
import type { TableView } from './types';

function table(n: number, futureKey: string | null): TableView {
	return { table: n, beatState: 'done', step: null, totalSteps: 10, futureKey, images: [] };
}

function inState(n: number, beatState: TableView['beatState']): TableView {
	return { table: n, beatState, step: null, totalSteps: 10, futureKey: null, images: [] };
}

describe('futureIndexOf', () => {
	it('is the palette position, so the accent and the order cannot disagree', () => {
		expect(futureIndexOf(FUTURES[0].key)).toBe(0);
		expect(futureIndexOf(FUTURES[2].key)).toBe(2);
	});

	it('is null for no lens and for a key that is not a future', () => {
		expect(futureIndexOf(null)).toBeNull();
		expect(futureIndexOf('')).toBeNull();
		expect(futureIndexOf('not-a-future')).toBeNull();
	});
});

describe('byLensThenTable', () => {
	it('puts tables that argued from the same future together', () => {
		const a = FUTURES[0].key;
		const b = FUTURES[1].key;
		const out = byLensThenTable([table(1, b), table(2, a), table(3, b), table(4, a)]);
		expect(out.map((t) => t.table)).toEqual([2, 4, 1, 3]);
	});

	it('sends tables with no lens to the end rather than the front', () => {
		const out = byLensThenTable([table(1, null), table(2, FUTURES[0].key)]);
		expect(out.map((t) => t.table)).toEqual([2, 1]);
	});

	it('does not reorder its argument — the caller keeps polling into the same array', () => {
		const input = [table(3, FUTURES[1].key), table(1, FUTURES[0].key)];
		byLensThenTable(input);
		expect(input.map((t) => t.table)).toEqual([3, 1]);
	});
});

describe('stillAnswering', () => {
	it('counts only tables that have not sent their answers', () => {
		const room = [
			inState(1, 'not-started'),
			inState(2, 'choosing'),
			inState(3, 'answering'),
			inState(4, 'reviewing'),
			inState(5, 'drawing'),
			inState(6, 'done')
		];
		expect(stillAnswering(room)).toBe(4);
	});

	it('does not count a table that submitted and is waiting on a render', () => {
		// The live defect: the ledger read "4 tables still answering" with
		// every table submitted, because four were waiting on a zone that had
		// failed. A table waiting on an image is not one the room waits for.
		expect(stillAnswering([inState(1, 'drawing'), inState(2, 'drawing')])).toBe(0);
	});

	it('is zero for a finished room, which is what makes the line disappear', () => {
		expect(stillAnswering([inState(1, 'done'), inState(2, 'done')])).toBe(0);
	});
});
