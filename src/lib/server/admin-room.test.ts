/**
 * Tests for the additive admin functions in `room.ts` — real SQLite
 * (`fake-d1.ts`) rather than a hand-rolled fake that pattern-matches SQL, so
 * these exercise the actual `INSERT ... ON CONFLICT`, `GROUP BY` and
 * "bare column follows a lone MAX()" queries `room.ts` relies on.
 */
import { describe, expect, it } from 'vitest';
import { fakeD1 } from './fake-d1';
import { setBeat, getBeat, resetTable, getResetAt, getCurrentAnswersSince, getCurrentImageSince, seedTables, countTables } from './room';
import { saveAnswer, getTableState, finishTable, insertPrompt, insertQueuedImage, getCurrentImage, getTableFutures, getRoom } from './room';
import { grantReopen, mayReopen, grantedTables } from './gate';

const EVENT = 'ev-test';

describe('setBeat / getBeat', () => {
	it('round-trips lobby -> progress -> focus with a table number', async () => {
		const d = fakeD1();
		expect(await getBeat(d, EVENT)).toEqual({ beat: 'lobby', focusTable: null });

		await setBeat(d, EVENT, 'progress');
		expect(await getBeat(d, EVENT)).toEqual({ beat: 'progress', focusTable: null });

		await setBeat(d, EVENT, 'focus', 7);
		expect(await getBeat(d, EVENT)).toEqual({ beat: 'focus', focusTable: 7 });

		// Switching away from focus clears the stale table number.
		await setBeat(d, EVENT, 'reveal');
		expect(await getBeat(d, EVENT)).toEqual({ beat: 'reveal', focusTable: null });
	});

	it('defaults to lobby for an event that never called setBeat', async () => {
		const d = fakeD1();
		expect(await getBeat(d, 'never-touched')).toEqual({ beat: 'lobby', focusTable: null });
	});
});

describe('resetTable', () => {
	it('leaves prior answer/image rows in place but reads current-since as empty', async () => {
		const d = fakeD1();
		await saveAnswer(d, { eventId: EVENT, table: 6, questionId: 'q1', keys: ['a'], actor: 'table', source: 'tap' });
		const promptId = await insertPrompt(d, {
			eventId: EVENT,
			table: 6,
			mood: 'm',
			material: 'mat',
			programme: 'p',
			feel: 'f',
			composed: 'the composed prompt',
			actor: 'table'
		});
		await insertQueuedImage(d, { eventId: EVENT, table: 6, zoneKey: 'library', promptId, prompt: 'the composed prompt', model: 'x', actor: 'table' });
		await finishTable(d, EVENT, 6);

		expect((await getTableState(d, EVENT, 6)).submittedAt).not.toBeNull();
		expect(await getCurrentImage(d, EVENT, 6, 'library')).not.toBeNull();

		await resetTable(d, EVENT, 6, 'admin');

		// The lifecycle flag clears...
		expect((await getTableState(d, EVENT, 6)).submittedAt).toBeNull();
		// ...but the reset is a watermark, not a delete: raw rows are untouched.
		expect(await getCurrentImage(d, EVENT, 6, 'library')).not.toBeNull();

		const since = await getResetAt(d, EVENT, 6);
		expect(since).toBeGreaterThan(0);
		// A *Since read taken after the reset sees nothing — that's what makes
		// the table look freshly seeded again to admin's own reads.
		expect(await getCurrentAnswersSince(d, EVENT, 6, since)).toEqual([]);
		expect(await getCurrentImageSince(d, EVENT, 6, 'library', since)).toBeNull();
	});

	it('an answer/image written AFTER the reset is current again', async () => {
		const d = fakeD1();
		await saveAnswer(d, { eventId: EVENT, table: 9, questionId: 'q1', keys: ['old'], actor: 'table', source: 'tap' });
		await resetTable(d, EVENT, 9);
		const since = await getResetAt(d, EVENT, 9);

		// A real reset-then-reanswer is seconds apart, not sub-millisecond;
		// this tick is only here so the test doesn't hit the same `Date.now()`
		// millisecond `saveAnswer`'s plain (non-monotonic) clock uses.
		await new Promise((r) => setTimeout(r, 2));
		await saveAnswer(d, { eventId: EVENT, table: 9, questionId: 'q1', keys: ['fresh'], actor: 'table', source: 'tap' });
		const current = await getCurrentAnswersSince(d, EVENT, 9, since);
		expect(current).toHaveLength(1);
		expect(current[0].keys).toEqual(['fresh']);
	});
});

describe('reopenTable grant (gate.ts)', () => {
	it('is consumed exactly once', async () => {
		const d = fakeD1();
		await grantReopen(d, EVENT, 3);
		expect(await mayReopen(d, EVENT, 3)).toBe(true);
		expect(await grantedTables(d, EVENT)).toEqual(new Set([3]));

		// assertCanSubmit's own consumeReopen path is exercised in gate.test.ts;
		// here we only check the batched read admin.remote.ts's poll uses.
		expect(await grantedTables(d, 'a-different-event')).toEqual(new Set());
	});
});

describe('getTableFutures', () => {
	it('reads the future pick from the `future` answer row, not the dead event_table column', async () => {
		const d = fakeD1();
		await saveAnswer(d, { eventId: EVENT, table: 4, questionId: 'future', keys: ['solarpunk'], actor: 'table', source: 'tap' });
		await saveAnswer(d, { eventId: EVENT, table: 5, questionId: 'q1', keys: ['recognisably-2035'], actor: 'table', source: 'tap' });

		const futures = await getTableFutures(d, EVENT);
		expect(futures.get(4)).toBe('solarpunk');
		expect(futures.get(5)).toBeUndefined(); // table 5 never answered the future question
	});

	it('latest-wins when a table changes its pick', async () => {
		const d = fakeD1();
		await saveAnswer(d, { eventId: EVENT, table: 2, questionId: 'future', keys: ['arcology'], actor: 'table', source: 'tap' });
		await new Promise((r) => setTimeout(r, 2));
		await saveAnswer(d, { eventId: EVENT, table: 2, questionId: 'future', keys: ['garden-city'], actor: 'table', source: 'tap' });
		expect((await getTableFutures(d, EVENT)).get(2)).toBe('garden-city');
	});
});

describe('getRoom currentStep', () => {
	it('is the highest q<N> reached, not the hardcoded 0 it used to be', async () => {
		const d = fakeD1();
		await saveAnswer(d, { eventId: EVENT, table: 1, questionId: 'q1', keys: ['x'], actor: 'table', source: 'tap' });
		await saveAnswer(d, { eventId: EVENT, table: 1, questionId: 'q4', keys: ['y'], actor: 'table', source: 'tap' });
		await saveAnswer(d, { eventId: EVENT, table: 1, questionId: 'q2', keys: ['z'], actor: 'table', source: 'tap' });
		// A non-numbered pseudo-question must not move the count.
		await saveAnswer(d, { eventId: EVENT, table: 1, questionId: 'future', keys: ['solarpunk'], actor: 'table', source: 'tap' });

		const room = await getRoom(d, EVENT, 3);
		expect(room.tables.find((t) => t.table === 1)?.currentStep).toBe(4);
		expect(room.tables.find((t) => t.table === 2)?.currentStep).toBe(0);
	});
});

describe('seedTables / countTables', () => {
	it('seeds an empty room and refuses a second seed', async () => {
		const d = fakeD1();
		expect(await countTables(d, EVENT)).toBe(0);
		const first = await seedTables(d, EVENT, 20);
		expect(first).toEqual({ ok: true, seeded: 20 });
		expect(await countTables(d, EVENT)).toBe(20);

		const second = await seedTables(d, EVENT, 20);
		expect(second.ok).toBe(false);
	});

	it('does not refuse a DIFFERENT event that is still empty', async () => {
		const d = fakeD1();
		await seedTables(d, EVENT, 20);
		const other = await seedTables(d, 'other-event', 20);
		expect(other).toEqual({ ok: true, seeded: 20 });
	});
});
