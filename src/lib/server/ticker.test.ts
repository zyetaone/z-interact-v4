/**
 * `tickAndPersist` against a REAL SQLite row (`fake-d1.ts`), not a mocked
 * state field — the point of these cases is the database write deciding the
 * race, which a mock cannot demonstrate.
 *
 * The bug: three tickers (phone poll, admin poll, fal webhook) run on
 * independent clocks and each decides from a snapshot its own caller read.
 * Two of them holding the same `queued` snapshot both called `submit` —
 * two paid fal jobs for one row.
 */
import { describe, expect, it, vi } from 'vitest';
import { fakeD1 } from './fake-d1';
import { insertQueuedImage, getImageById } from './room';
import { tickAndPersist, type TickableImageRow } from './ticker';
import { STALE_CLAIM_MS } from './generate';
import type { GenerateDeps } from './generate';

const EVENT = 'test-event';

async function queuedRow(db: D1Database) {
	return insertQueuedImage(db, {
		eventId: EVENT,
		table: 7,
		zoneKey: 'library',
		promptId: 'p-1',
		prompt: 'a prompt',
		model: 'test-model'
	});
}

function tickable(row: Awaited<ReturnType<typeof queuedRow>>): TickableImageRow {
	return {
		id: row.id,
		state: row.state,
		falRequestId: row.falRequestId,
		createdAt: row.createdAt,
		table: row.table,
		zoneKey: row.zoneKey
	};
}

function deps(overrides: Partial<GenerateDeps> = {}): GenerateDeps {
	return {
		submit: vi.fn(async () => ({ requestId: `req-${crypto.randomUUID()}` })),
		pollStatus: vi.fn(async () => ({ status: 'COMPLETED' as const })),
		fetchResult: vi.fn(async () => ({ imageUrl: 'https://v3.fal.media/a.webp' })),
		fetchBytes: vi.fn(async () => new ArrayBuffer(4)),
		putR2: vi.fn(async () => ({ r2Key: 'k' })),
		...overrides
	};
}

describe('tickAndPersist — compare-and-swap', () => {
	it('two tickers reading the same queued row submit to fal exactly once', async () => {
		const db = fakeD1();
		const row = await queuedRow(db);
		// Both tickers hold the SAME pre-claim snapshot — the routine case
		// when the admin desk is open on a table that is drawing.
		const snapshot = tickable(row);
		const a = deps();
		const b = deps();

		await tickAndPersist(db, snapshot, 'a prompt', a);
		await tickAndPersist(db, snapshot, 'a prompt', b);

		const submits =
			(a.submit as ReturnType<typeof vi.fn>).mock.calls.length +
			(b.submit as ReturnType<typeof vi.fn>).mock.calls.length;
		expect(submits).toBe(1);
	});

	it('the loser writes nothing — the winner\'s fal request id survives', async () => {
		const db = fakeD1();
		const row = await queuedRow(db);
		const snapshot = tickable(row);
		const winner = deps({ submit: vi.fn(async () => ({ requestId: 'req-winner' })) });
		const loser = deps({ submit: vi.fn(async () => ({ requestId: 'req-loser' })) });

		await tickAndPersist(db, snapshot, 'a prompt', winner);
		await tickAndPersist(db, snapshot, 'a prompt', loser);

		const stored = await getImageById(db, row.id);
		expect(stored?.state).toBe('requested');
		expect(stored?.falRequestId).toBe('req-winner');
		expect(loser.submit).not.toHaveBeenCalled();
	});

	it('a claimed row advances requested -> stored on the next tick', async () => {
		const db = fakeD1();
		const row = await queuedRow(db);
		await tickAndPersist(db, tickable(row), 'a prompt', deps());

		const claimed = await getImageById(db, row.id);
		expect(claimed).not.toBeNull();
		await tickAndPersist(
			db,
			{ ...tickable(row), state: claimed!.state, falRequestId: claimed!.falRequestId },
			'a prompt',
			deps({ putR2: vi.fn(async () => ({ r2Key: 'event/7/library/x.webp' })) })
		);

		const after = await getImageById(db, row.id);
		expect(after?.state).toBe('stored');
		expect(after?.r2Key).toBe('event/7/library/x.webp');
	});

	it('a claim whose owner died is failed once it goes stale, not left for ever', async () => {
		const db = fakeD1();
		const row = await queuedRow(db);
		// Claim lands, submit never does.
		await tickAndPersist(
			db,
			tickable(row),
			'a prompt',
			deps({
				submit: vi.fn(async () => {
					throw new Error('isolate recycled mid-submit');
				})
			})
		);
		// That throw already fails it — force the other path: a row that is
		// `requested` with no id and is older than the stale window.
		const revived = { ...tickable(row), state: 'requested', falRequestId: null, createdAt: Date.now() - STALE_CLAIM_MS - 1 };
		await db.prepare(`UPDATE image SET state = 'requested', error = NULL WHERE id = ?`).bind(row.id).run();
		await tickAndPersist(db, revived, 'a prompt', deps());

		const after = await getImageById(db, row.id);
		expect(after?.state).toBe('failed');
	});

	it('a fresh claim with no request id is left alone — a submit may still be in flight', async () => {
		const db = fakeD1();
		const row = await queuedRow(db);
		await db.prepare(`UPDATE image SET state = 'requested' WHERE id = ?`).bind(row.id).run();
		const fresh = { ...tickable(row), state: 'requested', falRequestId: null, createdAt: Date.now() };
		const d = deps();
		await tickAndPersist(db, fresh, 'a prompt', d);

		const after = await getImageById(db, row.id);
		expect(after?.state).toBe('requested');
		expect(d.submit).not.toHaveBeenCalled();
	});
});
