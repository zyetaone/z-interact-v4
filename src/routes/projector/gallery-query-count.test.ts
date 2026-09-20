/**
 * THE WALL'S POLL MUST NOT GROW WITH THE ROOM.
 *
 * `getProjectorRoom` once called `getCurrentImage` per table per zone
 * inside a `Promise.all` — up to 80 D1 reads every 3 s, on the one screen
 * the whole room is looking at. It is batched now (`getBeat` +
 * `getAdminRoomRows` + `getTableFutures`), and this test is the thing that
 * notices if a per-table read creeps back in.
 *
 * The assertion is an upper bound well under `TABLE_COUNT`, not an exact
 * pin: the discriminating property is that the count does not scale with
 * the number of tables, and an exact number would break on any harmless
 * extra read. The first call is discarded because `ensureTable`'s DDL runs
 * once per binding per table.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeD1 } from '$lib/server/fake-d1';
import { claimQueued, insertPrompt, insertQueuedImage, markRequested, markStored, saveAnswer, seedTables } from '$lib/server/room';
import { TABLE_COUNT } from '$lib/game/questions';
import { ZONES } from '$lib/game/zones';

const EVENT = 'projector-query-count';

let db: D1Database;
let prepares = 0;

/** Counts `prepare` calls — one per D1 statement — around the real SQLite fake. */
function countingD1(inner: D1Database): D1Database {
	return {
		prepare(sql: string) {
			prepares++;
			return inner.prepare(sql);
		}
	} as unknown as D1Database;
}

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
			url: new URL('https://example.test/projector'),
			request: new Request('https://example.test/projector'),
			// Pinned to the FOUR-zone set deliberately: it is the worst case for
			// a read that might grow per table per zone, which is what this
			// measures. The hero default would make the test easier to pass.
			platform: { env: { DB: db, EVENT_ID: EVENT, ZONE_SET: 'four' }, context: { waitUntil: () => {} } }
		})
	};
});

vi.mock('$app/environment', () => ({ dev: false, building: false, browser: false }));

/** A full room: every table answered, submitted, and holding a stored render per zone. */
async function seedFullRoom() {
	await seedTables(db, EVENT, TABLE_COUNT);
	for (let t = 1; t <= TABLE_COUNT; t++) {
		await saveAnswer(db, { eventId: EVENT, table: t, questionId: 'future', keys: ['solarpunk'], actor: 'table', source: 'tap' });
		await saveAnswer(db, { eventId: EVENT, table: t, questionId: 'q2', keys: ['undersea'], actor: 'table', source: 'tap' });
		const promptId = await insertPrompt(db, {
			eventId: EVENT,
			table: t,
			mood: 'm',
			material: 'mat',
			programme: 'p',
			feel: 'f',
			composed: 'a composed prompt',
			actor: 'table'
		});
		for (const z of ZONES) {
			const row = await insertQueuedImage(db, {
				eventId: EVENT,
				table: t,
				zoneKey: z.key,
				promptId,
				prompt: 'a zone prompt',
				model: 'test-model'
			});
			// The real path to `stored`, compare-and-swap at each step — a bare
			// `markStored` on a queued row changes nothing and the table would
			// read as still drawing.
			await claimQueued(db, row.id);
			await markRequested(db, row.id, `req-${row.id}`);
			await markStored(db, row.id, `${EVENT}/${row.id}.webp`);
		}
		await db.prepare(`UPDATE event_table SET submitted_at = ? WHERE event_id = ? AND table_no = ?`).bind(Date.now(), EVENT, t).run();
	}
}

describe('getProjectorRoom query count', () => {
	beforeEach(async () => {
		db = countingD1(fakeD1());
		prepares = 0;
	});

	it('reads a full 20-table room in a handful of queries, not one per table per zone', async () => {
		await seedFullRoom();
		const { getProjectorRoom } = await import('./gallery.remote');

		// First call warms `ensureTable`'s per-table DDL; the poll that matters
		// is every one after it.
		await getProjectorRoom();
		prepares = 0;
		const room = await getProjectorRoom();

		expect(prepares).toBeLessThan(TABLE_COUNT);
		// The response is still the whole room, not a cheaper subset.
		expect(room.tables).toHaveLength(TABLE_COUNT);
		expect(room.tables[0].images).toHaveLength(ZONES.length);
		expect(room.tables[0].beatState).toBe('done');
		expect(room.tables[0].futureKey).toBe('solarpunk');
	});
});
