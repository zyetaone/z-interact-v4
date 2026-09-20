/**
 * PER-ZONE RETRY.
 *
 * The 20-table run stored 76 of 80 zone images; four tables lost one zone
 * each. Recovering one tile with *Draw again* costs four of that table's
 * twelve renders, so a table that has already regenerated once can hit the
 * cap trying to fix a single picture.
 *
 * Driven through the REAL command against real SQLite, with fal stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as v from 'valibot';
import { fakeD1 } from '$lib/server/fake-d1';
import {
	insertPrompt,
	insertQueuedImage,
	saveImageDetail,
	markFailed,
	markStored,
	claimQueued,
	getCurrentImage,
	getCurrentImageSince,
	getResetAt,
	resetTable,
	saveAnswer,
	finishTable
} from '$lib/server/room';
import { ZONES } from '$lib/game/zones';

const EVENT = 'retry-zone-test';
const TABLE = 4;
const ZONE = ZONES[1].key;
const SUBMITTED_PROMPT = 'the exact words this zone was drawn from';

let db: D1Database;
const waited: Promise<unknown>[] = [];
const falBodies: Record<string, unknown>[] = [];

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
			url: new URL('https://example.test/t/4'),
			request: new Request('https://example.test/t/4'),
			platform: {
				// This suite is about the FOUR-zone path (per-zone retry), so it pins
				// ZONE_SET rather than riding the new `hero` default.
				env: { DB: db, EVENT_ID: EVENT, FAL_KEY: 'test-key', ZONE_SET: 'four' },
				context: { waitUntil: (p: Promise<unknown>) => void waited.push(p.catch(() => {})) }
			}
		})
	};
});

vi.mock('$app/environment', () => ({ dev: false, building: false, browser: false }));

function stubFal() {
	vi.stubGlobal('fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
		falBodies.push(JSON.parse(String(init?.body ?? '{}')));
		return new Response(JSON.stringify({ request_id: 'req-retry' }), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	});
}

/** A table that answered, submitted, and whose one zone then failed. */
async function tableWithAFailedZone() {
	await saveAnswer(db, { eventId: EVENT, table: TABLE, questionId: 'q1', keys: ['a'], actor: 'table', source: 'tap' });
	await finishTable(db, EVENT, TABLE);
	const promptId = await insertPrompt(db, {
		eventId: EVENT,
		table: TABLE,
		mood: 'm',
		material: 'mat',
		programme: 'p',
		feel: 'f',
		composed: 'the table level composition',
		negative: 'collage',
		editedByTable: false,
		actor: 'table'
	});
	for (const z of ZONES) {
		const row = await insertQueuedImage(db, {
			eventId: EVENT,
			table: TABLE,
			zoneKey: z.key,
			promptId,
			prompt: SUBMITTED_PROMPT + ' (' + z.key + ')',
			model: 'test-model'
		});
		await saveImageDetail(db, {
			imageId: row.id,
			eventId: EVENT,
			table: TABLE,
			zoneKey: z.key,
			prompt: SUBMITTED_PROMPT + ' (' + z.key + ')'
		});
		if (z.key === ZONE) {
			await markFailed(db, row.id, 'fal result failed: 422');
		} else {
			// Through the real state machine: `markStored` is a compare-and-swap
			// against `requested`, so a fixture that jumps straight there from
			// `queued` silently does nothing and the test passes for the wrong
			// reason. It did, the first time this was written.
			await claimQueued(db, row.id);
			await markStored(db, row.id, EVENT + '/k-' + z.key);
		}
	}
}

describe('retryZone', () => {
	beforeEach(async () => {
		db = fakeD1();
		waited.length = 0;
		falBodies.length = 0;
		vi.unstubAllGlobals();
	});

	it('re-queues only the failed zone, with the prompt it was actually submitted with', async () => {
		await tableWithAFailedZone();
		stubFal();
		const { retryZone } = await import('./answers.remote');

		const out = await retryZone({ table: TABLE, zone: ZONE });
		await Promise.all(waited);

		expect(out).toEqual({ ok: true, queued: 1 });
		// One render, not four.
		expect(falBodies).toHaveLength(1);
		// Verbatim from the sidecar: a retry must not quietly become a
		// different picture from the one the table was promised.
		expect(falBodies[0].prompt).toBe(SUBMITTED_PROMPT + ' (' + ZONE + ')');

		const retried = await getCurrentImage(db, EVENT, TABLE, ZONE);
		expect(retried?.state).toBe('requested');
		for (const z of ZONES) {
			if (z.key === ZONE) continue;
			const other = await getCurrentImage(db, EVENT, TABLE, z.key);
			expect(other?.state).toBe('stored');
		}
	});

	it('refuses a zone that landed — that is Draw again, and it would cost a render', async () => {
		await tableWithAFailedZone();
		stubFal();
		const { retryZone } = await import('./answers.remote');

		const out = await retryZone({ table: TABLE, zone: ZONES[0].key });

		expect(out.ok).toBe(false);
		expect(falBodies).toHaveLength(0);
	});

	it('refuses an unknown zone rather than queueing a row nothing will render', async () => {
		await tableWithAFailedZone();
		stubFal();
		const { retryZone } = await import('./answers.remote');

		const out = await retryZone({ table: TABLE, zone: 'not-a-zone' });

		expect(out).toEqual({ ok: false, reason: 'unknown zone' });
		expect(falBodies).toHaveLength(0);
	});

	it('does not start a second attempt while one is already in flight', async () => {
		await tableWithAFailedZone();
		stubFal();
		const { retryZone } = await import('./answers.remote');

		const first = await retryZone({ table: TABLE, zone: ZONE });
		const second = await retryZone({ table: TABLE, zone: ZONE });
		await Promise.all(waited);

		expect(first.ok).toBe(true);
		expect(second.ok).toBe(false);
		expect(falBodies).toHaveLength(1);
	});
});

/**
 * RESUBMIT AFTER A DESK RESET.
 *
 * Live: table 20 was reset from the desk having had three stored zones and
 * one failed, walked again, and submitted. The export then showed ONE image
 * row — `garden`, the zone whose prior attempt had failed. The other three
 * were never sent, and the phone showed them drawing indefinitely.
 *
 * The conditional insert applied the reset watermark correctly. The read
 * that decided WHICH zones to insert did not: `getCurrentImage` ignores the
 * watermark, image rows are append-only, so each pre-reset `stored` row
 * still looked current and its zone was skipped as already done.
 */
describe('submit, reset, submit again', () => {
	beforeEach(() => {
		db = fakeD1();
		waited.length = 0;
		falBodies.length = 0;
		vi.unstubAllGlobals();
	});

	/** Walks a table far enough to submit, through the real commands. */
	async function walkAndSubmit() {
		const { saveAnswer: save, finishTable: finish } = await import('./answers.remote');
		await save({ table: TABLE, questionId: 'q1', keys: ['a'] });
		return finish({ table: TABLE });
	}

	it('creates a fresh row for EVERY zone, not just the one that had failed', async () => {
		stubFal();
		const { retryZone: _ } = await import('./answers.remote');

		// First pass: four zones, three of which land and one fails — the
		// live shape of table 20 before it was reset.
		await tableWithAFailedZone();
		for (const z of ZONES) {
			expect(await getCurrentImage(db, EVENT, TABLE, z.key)).not.toBeNull();
		}

		await resetTable(db, EVENT, TABLE, 'admin');
		const since = await getResetAt(db, EVENT, TABLE);

		// Nothing from before the reset counts as current any more.
		for (const z of ZONES) {
			expect(await getCurrentImageSince(db, EVENT, TABLE, z.key, since)).toBeNull();
		}

		await walkAndSubmit();
		await Promise.all(waited);

		// Four fresh rows, one per zone, all created after the watermark.
		for (const z of ZONES) {
			const row = await getCurrentImageSince(db, EVENT, TABLE, z.key, since);
			expect(row, `zone ${z.key} has no row after resubmit`).not.toBeNull();
			expect(row!.createdAt).toBeGreaterThan(since);
		}
	});

	it('sends one submit per zone, not one for the whole table', async () => {
		stubFal();
		await tableWithAFailedZone();
		await resetTable(db, EVENT, TABLE, 'admin');
		await walkAndSubmit();
		await Promise.all(waited);
		expect(falBodies.length).toBe(ZONES.length);
	});
});
