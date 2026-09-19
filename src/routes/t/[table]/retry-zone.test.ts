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
				env: { DB: db, EVENT_ID: EVENT, FAL_KEY: 'test-key' },
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
