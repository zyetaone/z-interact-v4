/**
 * THE READOUT MUST NOT GROW WITH THE ROOM EITHER.
 *
 * Found in the 21 Sep route review: `roomAnalytics` counted each table's
 * spend with its own awaited `getRenderBudget`, which is twenty sequential
 * D1 round trips — in a file whose own comment worries about an
 * invocation's ~1,000-call ceiling. `getRenderStamps` reads the same rows
 * once and the per-table reset watermark is applied in the caller.
 *
 * Two things are asserted, and the second is why the first is safe: the
 * spend count costs no per-table query, AND the numbers it produces still
 * honour each table's own watermark. A faster wrong answer is not the
 * trade being made here — a table the desk reset gets its allowance back,
 * and that is the rule `limits.ts` caps against.
 *
 * WHAT THIS DOES NOT CLAIM, measured 21 Sep and left alone deliberately:
 * the readout's own `exportRoomRows` is still a per-table loop and a full
 * twenty-table room costs ~122 D1 statements to read. That is the export's
 * shape, not the readout's, and it is shared with the desk's Export
 * button and the archive path. It is well inside an invocation's
 * ~1,000-call ceiling and this page is refreshed by hand rather than
 * polled, so rewriting it days before an event buys latency at the cost of
 * touching the one function the archive depends on. The assertion below is
 * therefore about the SHAPE that was fixed, not a total: no query is made
 * per table to count spend.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeD1 } from '$lib/server/fake-d1';
import { claimQueued, insertPrompt, insertQueuedImage, markRequested, markStored, resetTable, saveAnswer, seedTables } from '$lib/server/room';
import { TABLE_COUNT } from '$lib/game/questions';

const EVENT = 'analytics-query-count';
const TOKEN = 'desk-token';

let db: D1Database;
let statements: string[] = [];

function countingD1(inner: D1Database): D1Database {
	return {
		prepare(sql: string) {
			statements.push(sql);
			return inner.prepare(sql);
		}
	} as unknown as D1Database;
}

/** `getRenderBudget`'s statement — one per table, which is what was removed. */
const PER_TABLE_BUDGET = /COUNT\(\*\)[\s\S]*FROM image WHERE event_id = \? AND table_no = \?/;

vi.mock('$app/server', () => {
	const tag = <T extends object>(fn: T, type: string): T => Object.assign(fn, { __: { type } });
	const query = (a: unknown, b?: unknown) => {
		const fn = (b ?? a) as (arg?: unknown) => unknown;
		return tag((arg?: unknown) => {
			const run = () => Promise.resolve(fn(arg));
			return {
				then: (res: (value: unknown) => unknown, rej?: (reason: unknown) => unknown) => run().then(res, rej),
				refresh: () => Promise.resolve(),
				current: undefined
			};
		}, 'query');
	};
	return {
		query,
		command: (schema: unknown, fn: unknown) => tag(fn as object, 'command'),
		getRequestEvent: () => ({
			url: new URL('https://example.test/admin/analytics'),
			request: new Request('https://example.test/admin/analytics'),
			platform: { env: { DB: db, EVENT_ID: EVENT, ADMIN_TOKEN: TOKEN }, context: { waitUntil: () => {} } }
		})
	};
});

vi.mock('$app/environment', () => ({ dev: false, building: false, browser: false }));

/** `renders` image rows on one table, each walked to `stored` the real way. */
async function spend(table: number, renders: number) {
	const promptId = await insertPrompt(db, {
		eventId: EVENT,
		table,
		mood: 'm',
		material: 'mat',
		programme: 'p',
		feel: 'f',
		composed: 'a composed prompt',
		actor: 'table'
	});
	for (let i = 0; i < renders; i++) {
		const row = await insertQueuedImage(db, {
			eventId: EVENT,
			table,
			zoneKey: 'workspace',
			promptId,
			prompt: 'a prompt',
			model: 'test-model'
		});
		await claimQueued(db, row.id);
		await markRequested(db, row.id, `req-${row.id}`);
		await markStored(db, row.id, `${EVENT}/${row.id}.jpg`);
	}
}

async function seedRoom() {
	await seedTables(db, EVENT, TABLE_COUNT);
	for (let t = 1; t <= TABLE_COUNT; t++) {
		await saveAnswer(db, { eventId: EVENT, table: t, questionId: 'future', keys: ['solarpunk'], actor: 'table', source: 'tap' });
		await saveAnswer(db, { eventId: EVENT, table: t, questionId: 'q8', keys: ['saturated'], actor: 'table', source: 'tap' });
		await spend(t, 1);
		await db.prepare(`UPDATE event_table SET submitted_at = ? WHERE event_id = ? AND table_no = ?`).bind(Date.now(), EVENT, t).run();
	}
}

describe('roomAnalytics query count', () => {
	beforeEach(async () => {
		db = countingD1(fakeD1());
		statements = [];
	});

	it('costs no per-table query to count spend', async () => {
		await seedRoom();
		const { roomAnalytics } = await import('./analytics.remote');

		// First call warms `ensureTable`'s DDL; the read that matters is after.
		await roomAnalytics({ token: TOKEN });
		statements = [];
		const res = await roomAnalytics({ token: TOKEN });

		// Twenty of these is what the loop of `getRenderBudget` awaits used
		// to be. Zero is the shape; `getRenderStamps` reads them all at once.
		expect(statements.filter((s) => PER_TABLE_BUDGET.test(s))).toHaveLength(0);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		// Still the whole room, not a cheaper subset.
		expect(res.analytics.tables).toHaveLength(TABLE_COUNT);
		expect(res.analytics.totals.submitted).toBe(TABLE_COUNT);
	});

	it('counts each table its own renders, not the room average', async () => {
		await seedRoom();
		await spend(4, 3); // table 4 has redrawn three more times
		const { roomAnalytics } = await import('./analytics.remote');

		const res = await roomAnalytics({ token: TOKEN });
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		const byTable = new Map(res.analytics.tables.map((t) => [t.table, t.renders]));
		expect(byTable.get(4)).toBe(4);
		expect(byTable.get(5)).toBe(1);
	});

	it('gives a reset table its allowance back, which is the whole reason the watermark is read', async () => {
		await seedRoom();
		await spend(7, 5);
		const { roomAnalytics } = await import('./analytics.remote');

		const before = await roomAnalytics({ token: TOKEN });
		expect(before.ok && before.analytics.tables.find((t) => t.table === 7)?.renders).toBe(6);

		// The desk's reset is a watermark, never a delete — the rows stay in
		// D1 and stop counting. A room-wide count would still say six.
		await resetTable(db, EVENT, 7);
		const after = await roomAnalytics({ token: TOKEN });
		expect(after.ok).toBe(true);
		if (!after.ok) return;
		expect(after.analytics.tables.find((t) => t.table === 7)?.renders).toBe(0);
		// And nobody else moved.
		expect(after.analytics.tables.find((t) => t.table === 8)?.renders).toBe(1);
	});
});
