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
import { insertQueuedImage, getImageById, getImageDetail, insertQueuedImageIfIdle } from './room';
import { MAX_TICKS_TO_TERMINAL } from './generate';
import { realGenerateDeps, tickAndPersist, tickImageRow, tickRowSafely, type TickableImageRow } from './ticker';
import { RENDER_DEADLINE_MS, STALE_CLAIM_MS } from './generate';
import { FAL_MODEL } from './fal';
import { ZONES } from '$lib/game/zones';
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
		fetchBytes: vi.fn(async () => ({ bytes: new ArrayBuffer(4), contentType: 'image/webp' })),
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

	it('a render fal never finishes is failed past the deadline, so a redraw is possible', async () => {
		// The gap this closes: with fal answering IN_PROGRESS for ever, the row
		// stayed `requested`, and a `requested` row makes both the table's "Draw
		// again" and the desk's Redraw refuse as still drawing. Reset was the
		// only lever, and it makes the table re-answer all eleven questions.
		const db = fakeD1();
		const row = await queuedRow(db);
		await db.prepare(`UPDATE image SET state = 'requested' WHERE id = ?`).bind(row.id).run();
		const d = deps();
		d.pollStatus = async () => ({ status: 'IN_PROGRESS' as const });
		const stuck = {
			...tickable(row),
			state: 'requested' as const,
			falRequestId: 'req-that-never-finishes',
			createdAt: Date.now() - RENDER_DEADLINE_MS - 1
		};
		await tickAndPersist(db, stuck, 'a prompt', d);

		const after = await getImageById(db, row.id);
		expect(after?.state).toBe('failed');
		expect(after?.error ?? '').toContain('took too long');
	});

	it('a slow render inside the deadline is left to finish', async () => {
		const db = fakeD1();
		const row = await queuedRow(db);
		await db.prepare(`UPDATE image SET state = 'requested' WHERE id = ?`).bind(row.id).run();
		const d = deps();
		d.pollStatus = async () => ({ status: 'IN_PROGRESS' as const });
		const slow = {
			...tickable(row),
			state: 'requested' as const,
			falRequestId: 'req-still-working',
			createdAt: Date.now() - (RENDER_DEADLINE_MS - 60_000)
		};
		await tickAndPersist(db, slow, 'a prompt', d);

		const after = await getImageById(db, row.id);
		expect(after?.state).toBe('requested');
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

/**
 * The retry the fidelity run asked for. Four of twelve requests failed with
 * an opaque `fal result failed: 422` — one table's whole set, moments after
 * another succeeded 4/4 — which reads as a provider wobble rather than a bad
 * prompt.
 */
describe('tickAndPersist — one automatic retry', () => {
	async function claimedRow() {
		const db = fakeD1();
		const row = await insertQueuedImageIfIdle(db, {
			eventId: EVENT,
			table: 3,
			zoneKey: 'library',
			promptId: 'p-1',
			prompt: 'the exact per-zone text',
			model: 'test-model'
		});
		return { db, row: row! };
	}

	const http422 = () => {
		throw new Error('fal result failed: 422 prompt rejected');
	};

	it('a 4xx goes back to queued with its request id cleared, not straight to failed', async () => {
		const { db, row } = await claimedRow();
		await tickAndPersist(db, tickable(row), 'p', deps({ submit: vi.fn(async () => http422()) }));

		const after = await getImageById(db, row.id);
		expect(after?.state).toBe('queued');
		expect(after?.falRequestId).toBeNull();
		expect((await getImageDetail(db, row.id))?.attempt).toBe(2);
	});

	it('the SECOND failure is terminal — a retry loop would bill for ever', async () => {
		const { db, row } = await claimedRow();
		await tickAndPersist(db, tickable(row), 'p', deps({ submit: vi.fn(async () => http422()) }));
		const retried = await getImageById(db, row.id);
		await tickAndPersist(
			db,
			{ ...tickable(row), state: retried!.state },
			'p',
			deps({ submit: vi.fn(async () => http422()) })
		);

		const after = await getImageById(db, row.id);
		expect(after?.state).toBe('failed');
		expect(after?.error).toContain('prompt rejected');
	});

	it('a non-HTTP failure is terminal immediately — a blocked host will not clear on a retry', async () => {
		const { db, row } = await claimedRow();
		await tickAndPersist(
			db,
			tickable(row),
			'p',
			deps({
				submit: vi.fn(async () => {
					throw new Error('image url host is not on the allow-list');
				})
			})
		);
		expect((await getImageById(db, row.id))?.state).toBe('failed');
	});

	it('persists the exact per-zone prompt for audit', async () => {
		const { db, row } = await claimedRow();
		expect((await getImageDetail(db, row.id))?.prompt).toBe('the exact per-zone text');
	});
});


/**
 * The wiring of `REFERENCE_MODE`, asserted where it is actually paid for:
 * the HTTP request to fal. The pure rule is covered in `reference.test.ts`;
 * this is the end-to-end proof that an unset variable reaches fal as a
 * plain text-to-image call.
 */
describe('tickImageRow — REFERENCE_MODE at the fal boundary', () => {
	/** Captures the submit request and answers it with a queue id. */
	function captureSubmit() {
		const calls: { url: string; body: Record<string, unknown> }[] = [];
		const impl = async (input: RequestInfo | URL, init?: RequestInit) => {
			// The webhook token rides in the query string; the endpoint choice
			// is the path, so compare the path.
			const u = new URL(String(input));
			calls.push({ url: `${u.origin}${u.pathname}`, body: JSON.parse(String(init?.body ?? '{}')) });
			return new Response(JSON.stringify({ request_id: 'req-1' }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		};
		return { calls, impl };
	}

	const env = (mode?: string) =>
		({ FAL_KEY: 'k', FAL_WEBHOOK_SECRET: 's', REFERENCE_MODE: mode }) as never;

	async function submitFor(mode: string | undefined, zoneKey: string) {
		const db = fakeD1();
		const row = await insertQueuedImage(db, {
			eventId: EVENT,
			table: 7,
			zoneKey,
			promptId: 'p-1',
			prompt: 'a prompt',
			model: 'test-model'
		});
		const { calls, impl } = captureSubmit();
		vi.stubGlobal('fetch', impl);
		try {
			await tickImageRow(
				{ db, env: env(mode), event: EVENT, origin: 'https://event.test', futureKey: 'solarpunk' },
				tickable(row),
				'a prompt'
			);
		} finally {
			vi.unstubAllGlobals();
		}
		return calls;
	}

	it('unset — every zone is a plain text-to-image call with no image_urls', async () => {
		for (const zone of ZONES) {
			const calls = await submitFor(undefined, zone.key);
			expect(calls).toHaveLength(1);
			expect(calls[0].url).toBe(`https://queue.fal.run/${FAL_MODEL}`);
			expect(calls[0].body.image_urls).toBeUndefined();
		}
	});

	it('an unrecognised value is not a licence to chain — it falls back to plain', async () => {
		const calls = await submitFor('Chain', ZONES[0].key);
		expect(calls[0].url).toBe(`https://queue.fal.run/${FAL_MODEL}`);
		expect(calls[0].body.image_urls).toBeUndefined();
	});

	it('lens — the first zone goes to the edit endpoint with the lens picture, the rest do not', async () => {
		const anchor = await submitFor('lens', ZONES[0].key);
		expect(anchor[0].url).toBe(`https://queue.fal.run/${FAL_MODEL}/edit`);
		expect(anchor[0].body.image_urls).toEqual(['https://event.test/visuals/lens/solarpunk.jpg']);

		const other = await submitFor('lens', ZONES[1].key);
		expect(other[0].url).toBe(`https://queue.fal.run/${FAL_MODEL}`);
		expect(other[0].body.image_urls).toBeUndefined();
	});
});


/**
 * A REFUSED SUBMIT HAS TO REACH `failed`.
 *
 * Live, ~10:30 UTC: the fal account's balance ran out and every submit came
 * back `403 User is locked`. Table 20's three unsubmitted zones sat on the
 * phone showing "being drawn" with no error, indefinitely; only the desk's
 * 1/4 count hinted at it. A refused submit is an ANSWER, and a locked
 * account is not a wobble that a second attempt clears.
 */
describe('a submit refused with 403', () => {
	function stub403() {
		vi.stubGlobal('fetch', async () => new Response('User is locked. Please top up your balance.', { status: 403 }));
	}

	async function tickUntilTerminal(db: D1Database, id: string, rounds: number) {
		for (let i = 0; i < rounds; i++) {
			const row = await getImageById(db, id);
			if (!row || row.state === 'failed' || row.state === 'stored') return { row, ticks: i };
			await tickImageRow(
				{
					db,
					env: { FAL_KEY: 'k' } as never,
					event: EVENT,
					origin: 'https://event.test',
					futureKey: 'solarpunk'
				},
				{
					id: row.id,
					state: row.state,
					falRequestId: row.falRequestId,
					createdAt: row.createdAt,
					table: row.table,
					zoneKey: row.zoneKey
				},
				'a prompt'
			);
		}
		return { row: await getImageById(db, id), ticks: rounds };
	}

	it('reaches failed within a bounded number of ticks, not "being drawn" for ever', async () => {
		const db = fakeD1();
		const row = await insertQueuedImageIfIdle(db, {
			eventId: EVENT,
			table: 20,
			zoneKey: 'library',
			promptId: 'p-1',
			prompt: 'a prompt',
			model: 'test-model'
		});
		stub403();
		try {
			const out = await tickUntilTerminal(db, row!.id, 8);
			expect(out.row?.state).toBe('failed');
			expect(out.ticks).toBeLessThanOrEqual(MAX_TICKS_TO_TERMINAL);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('keeps the provider\'s own words, so the desk can say why', async () => {
		const db = fakeD1();
		const row = await insertQueuedImageIfIdle(db, {
			eventId: EVENT,
			table: 20,
			zoneKey: 'studio',
			promptId: 'p-1',
			prompt: 'a prompt',
			model: 'test-model'
		});
		stub403();
		try {
			await tickUntilTerminal(db, row!.id, 8);
		} finally {
			vi.unstubAllGlobals();
		}
		const failed = await getImageById(db, row!.id);
		expect(failed?.error).toContain('403');
		expect(failed?.error).toContain('User is locked');
	});

	it('does not spend a second submit on it — a locked account is not a wobble', async () => {
		const db = fakeD1();
		const row = await insertQueuedImageIfIdle(db, {
			eventId: EVENT,
			table: 20,
			zoneKey: 'plaza',
			promptId: 'p-1',
			prompt: 'a prompt',
			model: 'test-model'
		});
		let calls = 0;
		vi.stubGlobal('fetch', async () => {
			calls++;
			return new Response('User is locked. Please top up your balance.', { status: 403 });
		});
		try {
			await tickUntilTerminal(db, row!.id, 8);
		} finally {
			vi.unstubAllGlobals();
		}
		expect(calls).toBe(1);
	});
});


describe('tickRowSafely', () => {
	/**
	 * A context whose database throws something the D1 layer does NOT treat
	 * as a transient wobble — the shape of any failure that lands outside
	 * `tickAndPersist`'s own catch. A `D1_ERROR:` message is deliberately
	 * not used here: `room.ts` swallows those by design, which is correct
	 * and is why this test had to reach for a different throw to mean
	 * anything.
	 */
	function explodingCtx() {
		return {
			db: {
				prepare() {
					throw new TypeError('bucket handle is not a function');
				}
			} as unknown as D1Database,
			env: { FAL_KEY: 'k' } as never,
			event: EVENT,
			origin: 'https://event.test',
			futureKey: 'solarpunk'
		};
	}

	const row: TickableImageRow = {
		id: 'img-1',
		state: 'queued',
		falRequestId: null,
		createdAt: 1,
		table: 20,
		zoneKey: 'library'
	};

	it('reports a thrown tick as a reason instead of throwing', async () => {
		const out = await tickRowSafely(explodingCtx() as never, row, 'a prompt');
		expect(out.ticked).toBe(false);
		expect(out.reason).toContain('tick threw');
	});

	it('keeps the provider or database text, so the reason is diagnosable', async () => {
		const out = await tickRowSafely(explodingCtx() as never, row, 'a prompt');
		expect(out.reason).toContain('bucket handle is not a function');
	});

	it('lets the caller keep going — the rows behind a bad one still get their turn', async () => {
		// The live symptom: one row's throw ended the loop, and for the phone
		// the loop is inside the poll, so the whole query rejected and the
		// screen kept showing "being drawn" with no error.
		const reasons: string[] = [];
		for (const zone of ['library', 'studio', 'plaza', 'garden']) {
			const out = await tickRowSafely(explodingCtx() as never, { ...row, zoneKey: zone }, 'a prompt');
			reasons.push(out.reason);
		}
		expect(reasons).toHaveLength(4);
	});
});

/**
 * The 401 that is not the provider's fault.
 *
 * With `FAL_KEY` unset the deps used to send `Authorization: Key ` and fal
 * replied `401 Cannot access application "<model>". Authentication is
 * required` — indistinguishable, on the phone and in the readout, from an
 * account that is locked or out of balance. The runbook's morning probe
 * tells those apart; the app should not need it to name its own missing
 * variable.
 */
describe('an unset FAL_KEY', () => {
	const deps = (env: Record<string, unknown>) =>
		realGenerateDeps(env as never, EVENT, 1, ZONES[0].key, 'image-1');

	it('refuses to submit and names the variable and the command that sets it', async () => {
		await expect(deps({}).submit('a prompt', 'key-1')).rejects.toThrow(/FAL_KEY is not set/);
		await expect(deps({}).submit('a prompt', 'key-1')).rejects.toThrow(/pages secret put/);
	});

	it('still submits when a key IS set, so the guard cannot swallow a real run', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify({ request_id: 'r-1' }), { status: 200, headers: { 'content-type': 'application/json' } })
		);
		try {
			await expect(deps({ FAL_KEY: 'a-real-key' }).submit('a prompt', 'key-1')).resolves.toEqual({ requestId: 'r-1' });
		} finally {
			fetchSpy.mockRestore();
		}
	});

	it('leaves the FAL_FAKE path alone — a rehearsal has no key and must still draw', async () => {
		const proc = (globalThis as { process?: { env: Record<string, string | undefined> } }).process!;
		proc.env.FAL_FAKE = '1';
		try {
			await expect(deps({}).submit('a prompt', 'key-1')).resolves.toHaveProperty('requestId');
		} finally {
			delete proc.env.FAL_FAKE;
		}
	});
});
