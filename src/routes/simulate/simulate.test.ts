/**
 * The simulator, driven end to end with `FAL_FAKE=1`: twenty tables through
 * the REAL remote-function commands, the real gate, the real caps and the
 * real prompt composition, against real SQLite and an in-memory R2.
 *
 * `$app/server` is mocked with pass-throughs because `command`/`query` are
 * SvelteKit's request-bound transport, not logic — mocking them lets the
 * bodies underneath run exactly as they do in production.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as v from 'valibot';
import { fakeD1 } from '$lib/server/fake-d1';
import { ANCHOR_ZONE } from '$lib/server/reference';

const ENV_ID = 'sim-test-event';
const ADMIN_TOKEN = 'rehearsal-token';

let db: D1Database;
const waited: Promise<unknown>[] = [];
const bucket = new Map<string, { bytes: ArrayBuffer; contentType: string }>();

function fakeR2(): R2Bucket {
	return {
		async put(key: string, bytes: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
			bucket.set(key, { bytes, contentType: opts?.httpMetadata?.contentType ?? '' });
			return {} as never;
		},
		async get(key: string) {
			return (bucket.get(key) ?? null) as never;
		}
	} as unknown as R2Bucket;
}

vi.mock('$app/server', () => {
	// Kit's own `init_remote_functions` (run by the .remote.ts transform)
	// rejects any export without `__.type`, so the stand-ins carry it.
	const tag = <T extends object>(fn: T, type: string): T => Object.assign(fn, { __: { type } });

	// `command(schema, fn)` — validate then run, same as the real transport.
	const command = (schema: unknown, fn: (arg: unknown) => unknown) =>
		tag((arg: unknown) => Promise.resolve(fn(v.parse(schema as never, arg))), 'command');

	// `query(fn)` and `query(schema, fn)`. LAZY, like the real thing: calling
	// `tableStatus({ table })` must not run the query body, because that body
	// is itself a ticker and the commands call it purely to `refresh()`. An
	// eager stand-in would advance every generation row as a side effect of a
	// save, which is not what production does.
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
			url: new URL('https://example.test/simulate'),
			request: new Request('https://example.test/simulate'),
			platform: {
				env: {
					DB: db,
					IMAGES: fakeR2(),
					EVENT_ID: ENV_ID,
					ADMIN_TOKEN,
					SIMULATE_ENABLED: 'true',
					FAL_KEY: 'test-key'
				},
				context: {
					waitUntil: (p: Promise<unknown>) => {
						waited.push(p.catch(() => {}));
					}
				}
			}
		})
	};
});

vi.mock('$app/environment', () => ({ dev: false, building: false, browser: false }));

function simulateRequest(body: Record<string, unknown>) {
	return {
		request: new Request('https://example.test/simulate', {
			method: 'POST',
			body: JSON.stringify(body),
			headers: { 'content-type': 'application/json' }
		}),
		platform: {
			env: {
				DB: db,
				IMAGES: fakeR2(),
				EVENT_ID: ENV_ID,
				ADMIN_TOKEN,
				SIMULATE_ENABLED: 'true',
				FAL_KEY: 'test-key'
			}
		}
	};
}

beforeEach(() => {
	db = fakeD1();
	waited.length = 0;
	bucket.clear();
	(globalThis as { process?: { env: Record<string, string | undefined> } }).process!.env.FAL_FAKE = '1';
});

describe('POST /simulate', () => {
	it('drives tables through the real commands and the room agrees', async () => {
		const { POST } = await import('./+server');
		const res = await POST(simulateRequest({ token: ADMIN_TOKEN, tables: 4, seed: 42, staggerMs: 0 }) as never);
		const out = (await res.json()) as {
			ok: boolean;
			submitted: number;
			rendersQueued: number;
			disagreements: number[];
			refusals: string[];
			readBack: { table: number; currentStep: number; submittedAt: number | null }[];
		};

		expect(out.ok).toBe(true);
		expect(out.submitted).toBe(4);
		// Four zones per table, all four tables.
		expect(out.rendersQueued).toBe(16);
		// The read-back check game-flow.md §8 asks for.
		expect(out.disagreements).toEqual([]);
		expect(out.refusals).toEqual([]);
		for (const row of out.readBack) {
			expect(row.submittedAt).not.toBeNull();
			expect(row.currentStep).toBeGreaterThan(0);
		}

		// Let the `waitUntil` kicks finish. With `REFERENCE_MODE` at its default
		// `none` nothing references anything, so no zone waits for another and
		// all sixteen go out on the first kick — four tables in parallel, which
		// is the shape the night needs. Under `chain` only the four anchor
		// zones would be requested here and the other twelve would still be
		// queued; that ordering is covered in `server/ticker.test.ts`.
		await Promise.all(waited);
		const afterKick = await db
			.prepare(`SELECT zone_key, state FROM image WHERE event_id = ?`)
			.bind(ENV_ID)
			.all<{ zone_key: string; state: string }>();
		expect(afterKick.results).toHaveLength(16);
		expect(afterKick.results.filter((r) => r.state === 'requested')).toHaveLength(16);
		expect(afterKick.results.filter((r) => r.zone_key === ANCHOR_ZONE)).toHaveLength(4);

		// Now drive the PHONE'S OWN POLL, which is the second of the three
		// tickers, and let it carry every row the rest of the way: the anchor
		// stores, which unblocks its three siblings, which submit and store.
		// Each poll advances a row by one step, so the set needs a few rounds —
		// exactly how it behaves on the night.
		const { tableStatus } = await import('../t/[table]/answers.remote');
		for (let round = 0; round < 6; round++) {
			for (const row of out.readBack) await tableStatus({ table: row.table });
		}

		const { results } = await db
			.prepare(`SELECT state, r2_key FROM image WHERE event_id = ?`)
			.bind(ENV_ID)
			.all<{ state: string; r2_key: string | null }>();
		expect(results).toHaveLength(16);
		expect(results.every((r) => r.state === 'stored')).toBe(true);
		expect(results.every((r) => !!r.r2_key)).toBe(true);
		expect(bucket.size).toBe(16);
		// Every key is under this event's prefix, which is what the projector's
		// image route now requires.
		for (const key of bucket.keys()) expect(key.startsWith(`${ENV_ID}/`)).toBe(true);
		// The fake image is a PNG, so the stored type must say so — not the
		// blanket `image/webp` every object used to be written as.
		for (const stored of bucket.values()) expect(stored.contentType).toBe('image/png');
	});

	it('is repeatable: the same seed plans the same room', async () => {
		const { POST } = await import('./+server');
		const first = (await (
			await POST(simulateRequest({ token: ADMIN_TOKEN, tables: 3, seed: 7, staggerMs: 0, answersOnly: true }) as never)
		).json()) as { reports: { futureKey: string; era: string }[] };
		db = fakeD1();
		const second = (await (
			await POST(simulateRequest({ token: ADMIN_TOKEN, tables: 3, seed: 7, staggerMs: 0, answersOnly: true }) as never)
		).json()) as { reports: { futureKey: string; era: string }[] };
		expect(second.reports.map((r) => r.futureKey)).toEqual(first.reports.map((r) => r.futureKey));
		expect(second.reports.map((r) => r.era)).toEqual(first.reports.map((r) => r.era));
	});

	it('answersOnly stops before any render is queued', async () => {
		const { POST } = await import('./+server');
		const res = await POST(
			simulateRequest({ token: ADMIN_TOKEN, tables: 2, seed: 3, staggerMs: 0, answersOnly: true }) as never
		);
		const out = (await res.json()) as { rendersQueued: number; submitted: number };
		expect(out.rendersQueued).toBe(0);
		expect(out.submitted).toBe(0);
	});

	it('refuses a bad token, and refuses when ADMIN_TOKEN is unset', async () => {
		const { POST } = await import('./+server');
		const bad = simulateRequest({ token: 'wrong', tables: 1, seed: 1, staggerMs: 0 });
		expect((await POST(bad as never)).status).toBe(401);

		const unset = simulateRequest({ token: 'anything', tables: 1, seed: 1, staggerMs: 0 });
		(unset.platform.env as Record<string, unknown>).ADMIN_TOKEN = undefined;
		expect((await POST(unset as never)).status).toBe(401);
	});

	it('is off unless SIMULATE_ENABLED is exactly "true"', async () => {
		const { POST } = await import('./+server');
		const off = simulateRequest({ token: ADMIN_TOKEN, tables: 1, seed: 1, staggerMs: 0 });
		(off.platform.env as Record<string, unknown>).SIMULATE_ENABLED = 'false';
		expect((await POST(off as never)).status).toBe(404);
	});
});
