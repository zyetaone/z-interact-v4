/**
 * THE DESK MUST NOT WAIT FOR FAL.
 *
 * Measured live with ~60 pending rows after the 20-table render run:
 * `GET /admin?token=...` returned in 36.6 s and 35.3 s on two runs, while
 * the projector answered in 0.7 s. The admin read was awaiting its own
 * ticker, and a tick is a fal round trip.
 *
 * This drives the REAL `adminRoom` query with sixty pending rows and a fal
 * that takes 40 ms to answer, and asserts both halves of the fix: the read
 * returns having made no provider call at all, and the deferred work that
 * runs after it is bounded to the row budget rather than walking all sixty.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as v from 'valibot';
import { fakeD1 } from '$lib/server/fake-d1';
import { insertPrompt, insertQueuedImage, seedTables, claimQueued, markFailed } from '$lib/server/room';

const EVENT = 'admin-tick-test';
const ADMIN_TOKEN = 'desk-token';
const PENDING_ROWS = 60;
const FAL_LATENCY_MS = 40;
const BUDGET = 8;

let db: D1Database;
/** Which zone set the case under test runs with; reset to `four` per test. */
let zoneSetForTest: string | undefined = 'four';
const waited: Promise<unknown>[] = [];
let falCalls = 0;

vi.mock('$app/server', () => {
	const tag = <T extends object>(fn: T, type: string): T => Object.assign(fn, { __: { type } });
	const command = (schema: unknown, fn: (arg: unknown) => unknown) =>
		tag((arg: unknown) => Promise.resolve(fn(v.parse(schema as never, arg))), 'command');
	const query = (a: unknown, b?: unknown) => {
		const schema = b ? a : null;
		const fn = (b ?? a) as (arg?: unknown) => unknown;
		return tag((arg?: unknown) => {
			const run = () => Promise.resolve(fn(schema ? v.parse(schema as never, arg) : arg));
			return {
				then: (res: (value: unknown) => unknown, rej?: (reason: unknown) => unknown) => run().then(res, rej),
				refresh: () => Promise.resolve(),
				current: undefined
			};
		}, 'query');
	};
	return {
		command,
		query,
		getRequestEvent: () => ({
			url: new URL('https://example.test/admin'),
			request: new Request('https://example.test/admin'),
			platform: {
				// Seeds four-zone rows, so it pins the four-zone set rather than
				// riding the `hero` default; the desk's one-image shape is
				// asserted separately below.
				env: { DB: db, EVENT_ID: EVENT, ADMIN_TOKEN, FAL_KEY: 'test-key', ZONE_SET: zoneSetForTest },
				// Captured rather than run, which is what Cloudflare does: the
				// response goes out first and this runs after it.
				context: { waitUntil: (p: Promise<unknown>) => void waited.push(p.catch(() => {})) }
			}
		})
	};
});

vi.mock('$app/environment', () => ({ dev: false, building: false, browser: false }));

/** A fal that is slow enough for a sequential walk of sixty rows to be obvious. */
function stubFal() {
	vi.stubGlobal('fetch', async () => {
		falCalls++;
		await new Promise((r) => setTimeout(r, FAL_LATENCY_MS));
		return new Response(JSON.stringify({ request_id: `req-${falCalls}` }), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	});
}

async function seedPending(rows: number) {
	await seedTables(db, EVENT, 20);
	const promptId = await insertPrompt(db, {
		eventId: EVENT,
		table: 1,
		mood: 'm',
		material: 'mat',
		programme: 'p',
		feel: 'f',
		composed: 'a composed prompt',
		negative: 'collage',
		editedByTable: false,
		actor: 'table'
	});
	for (let i = 0; i < rows; i++) {
		await insertQueuedImage(db, {
			eventId: EVENT,
			table: (i % 20) + 1,
			// A distinct zone per row so nothing is deduped away.
			zoneKey: ['library', 'studio', 'plaza', 'garden'][i % 4],
			promptId,
			prompt: 'a zone prompt',
			model: 'test-model'
		});
	}
}

/**
 * Backdates every pending row past the desk's cooling window. Without this
 * the slice skips all of them as "just touched by the phone", and a test
 * asserting an upper bound on fal calls would pass for the wrong reason.
 */
async function backdatePending(ms: number) {
	await db.prepare(`UPDATE image SET created_at = created_at - ?`).bind(ms).run();
}

describe('adminRoom with a room full of pending rows', () => {
	beforeEach(async () => {
		db = fakeD1();
		zoneSetForTest = 'four';
		waited.length = 0;
		falCalls = 0;
		vi.unstubAllGlobals();
	});

	it('answers from D1 without making a single provider call', async () => {
		await seedPending(PENDING_ROWS);
		stubFal();
		const { adminRoom } = await import('./admin.remote');

		const room = await adminRoom({ token: ADMIN_TOKEN });

		// The whole point: the desk's screen is built and returned before any
		// of this event's pending rows have been touched.
		expect(falCalls).toBe(0);
		expect(room.tables).toHaveLength(20);
		expect(waited.length).toBeGreaterThan(0);
	});

	it('advances at most the row budget afterwards, not all sixty', async () => {
		await seedPending(PENDING_ROWS);
		await backdatePending(10_000);
		stubFal();
		const { adminRoom } = await import('./admin.remote');

		await adminRoom({ token: ADMIN_TOKEN });
		await Promise.all(waited);

		// Greater than zero matters as much as the bound: it proves the slice
		// actually ran, so the upper bound is not passing because the cooling
		// window skipped every row.
		expect(falCalls).toBeGreaterThan(0);
		expect(falCalls).toBeLessThanOrEqual(BUDGET);
	});

	it('carries a failed zone and the provider\'s own words to the desk', async () => {
		await seedPending(4);
		const failed = await db
			.prepare(`SELECT id FROM image WHERE event_id = ? AND table_no = 1 AND zone_key = 'library'`)
			.bind(EVENT)
			.first<{ id: string }>();
		expect(failed).toBeTruthy();
		expect(await claimQueued(db, failed!.id)).toBe(true);
		expect(await markFailed(db, failed!.id, 'fal: 422 content_policy_violation')).toBe(true);
		stubFal();
		const { adminRoom } = await import('./admin.remote');

		const row = (await adminRoom({ token: ADMIN_TOKEN })).tables[0];

		expect(row.images[0]).toBe('failed');
		expect(row.imageErrors[0]).toBe('fal: 422 content_policy_violation');
		// One other zone, not three: the question cut left two act zones.
		expect(row.imageErrors.slice(1)).toEqual([null]);
	});

	it('makes no provider call at all for a bad token', async () => {
		await seedPending(4);
		stubFal();
		const { adminRoom } = await import('./admin.remote');

		const room = await adminRoom({ token: 'wrong' });

		expect(room.tables).toHaveLength(0);
		expect(waited).toHaveLength(0);
		expect(falCalls).toBe(0);
	});

	it('reports ONE zone column under the hero default, and the tick still carries the row', async () => {
		// The desk reads `zoneKeys` from the payload rather than importing
		// ZONES: a desk that assumed four would label a one-image room wrong,
		// and its per-zone Redraw would offer a control for zones that do not
		// exist in this room.
		zoneSetForTest = undefined;
		await seedPending(2);
		stubFal();
		const { adminRoom } = await import('./admin.remote');

		const room = await adminRoom({ token: ADMIN_TOKEN });
		expect(room.zoneKeys).toEqual(['workspace']);
		for (const row of room.tables) {
			expect(row.images).toHaveLength(1);
			expect(row.imageErrors).toHaveLength(1);
		}
	});
});
