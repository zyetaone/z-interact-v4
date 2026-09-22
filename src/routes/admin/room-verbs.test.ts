/**
 * THE TWO ROOM-WIDE VERBS, and the difference between them.
 *
 * game-flow.md §5 asked for "delete one table / clear the room" and this app
 * shipped neither: `resetTable` was a watermark and there was no room-wide
 * anything. The risk in adding them is that they look alike on a desk —
 * two buttons, both meaning "start over" — while one is undoable and one
 * ends the event's record. These tests hold that line:
 *
 *   resetRoom  — every row still there afterwards, in the export
 *   clearRoom  — rows gone, and it REFUSES unless the caller names the event
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeD1 } from '$lib/server/fake-d1';
import { claimQueued, insertPrompt, insertQueuedImage, markRequested, markStored, saveAnswer, seedTables, getCurrentAnswersSince, getResetAt } from '$lib/server/room';
import { TABLE_COUNT } from '$lib/game/questions';

const EVENT = 'room-verbs';
const TOKEN = 'desk-token';
let db: D1Database;

vi.mock('$app/server', () => {
	const tag = <T extends object>(fn: T, type: string): T => Object.assign(fn, { __: { type } });
	const query = (a: unknown, b?: unknown) => {
		const fn = (b ?? a) as (arg?: unknown) => unknown;
		return tag((arg?: unknown) => {
			const run = () => Promise.resolve(fn(arg));
			return { then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => run().then(r, j), refresh: () => Promise.resolve(), current: undefined };
		}, 'query');
	};
	return {
		query,
		command: (schema: unknown, fn: unknown) => tag(fn as object, 'command'),
		getRequestEvent: () => ({
			url: new URL('https://example.test/admin'),
			request: new Request('https://example.test/admin'),
			platform: { env: { DB: db, EVENT_ID: EVENT, ADMIN_TOKEN: TOKEN }, context: { waitUntil: () => {} } }
		})
	};
});
vi.mock('$app/environment', () => ({ dev: false, building: false, browser: false }));

async function seedRoom() {
	await seedTables(db, EVENT, TABLE_COUNT);
	for (let t = 1; t <= 3; t++) {
		await saveAnswer(db, { eventId: EVENT, table: t, questionId: 'q2', keys: ['warm-earthy'], actor: 'table', source: 'tap' });
		const promptId = await insertPrompt(db, { eventId: EVENT, table: t, mood: 'm', material: 'x', programme: 'p', feel: 'f', composed: 'a prompt', actor: 'table' });
		const row = await insertQueuedImage(db, { eventId: EVENT, table: t, zoneKey: 'workspace', promptId, prompt: 'p', model: 'm' });
		await claimQueued(db, row.id);
		await markRequested(db, row.id, `req-${row.id}`);
		await markStored(db, row.id, `${EVENT}/${row.id}.jpg`);
	}
}

async function count(table: string): Promise<number> {
	const r = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE event_id = ?`).bind(EVENT).first<{ n: number }>();
	return r?.n ?? 0;
}

describe('the room-wide verbs', () => {
	beforeEach(async () => {
		db = fakeD1();
		await seedRoom();
	});

	it('resetRoom deletes nothing — the rows are the event record', async () => {
		const { resetRoom } = await import('./admin.remote');
		const before = { answer: await count('answer'), image: await count('image'), prompt: await count('prompt') };

		const res = await resetRoom({ token: TOKEN });
		expect(res.ok).toBe(true);

		expect(await count('answer')).toBe(before.answer);
		expect(await count('image')).toBe(before.image);
		expect(await count('prompt')).toBe(before.prompt);
		// ...but the tables READ as empty, which is the point of a watermark.
		// Read the way the app reads: `getCurrentAnswers` is the raw query and
		// does not apply the watermark — `getResetAt` + `…Since` is what every
		// caller actually uses, and asserting on the raw one would have called
		// this feature broken while it worked.
		const since = await getResetAt(db, EVENT, 1);
		expect(await getCurrentAnswersSince(db, EVENT, 1, since)).toHaveLength(0);
	});

	it('clearRoom REFUSES without the event id, and a token alone is not enough', async () => {
		const { clearRoom } = await import('./admin.remote');

		const wrong = await clearRoom({ token: TOKEN, confirm: 'not-the-event' });
		expect(wrong.ok).toBe(false);
		// The row count is the assertion that matters: a refusal that still
		// deleted would pass a check of `ok` alone.
		expect(await count('answer')).toBe(3);
		expect(await count('image')).toBe(3);
	});

	/*
	 * The token no longer guards this (`ADMIN_SCREENS_OPEN`, 22 Sep). The
	 * TYPED EVENT ID still does, and it is now the only thing that does —
	 * which is exactly why it was built as a separate confirmation rather
	 * than a second click, and why it is worth a test of its own now that
	 * it stands alone.
	 */
	it('clearRoom deletes nothing without the event id typed back, token or no token', async () => {
		const { clearRoom } = await import('./admin.remote');
		expect((await clearRoom({ token: 'wrong', confirm: 'not-the-event' })).ok).toBe(false);
		expect((await clearRoom({ token: TOKEN, confirm: '' })).ok).toBe(false);
		expect(await count('answer')).toBe(3);
	});

	it('clearRoom with both empties the event and re-seeds the tables', async () => {
		const { clearRoom } = await import('./admin.remote');
		const res = await clearRoom({ token: TOKEN, confirm: EVENT });
		expect(res.ok).toBe(true);

		expect(await count('answer')).toBe(0);
		expect(await count('prompt')).toBe(0);
		expect(await count('image')).toBe(0);
		// The room is usable immediately afterwards rather than needing a seed.
		const seeded = await db.prepare(`SELECT COUNT(*) AS n FROM event_table WHERE event_id = ?`).bind(EVENT).first<{ n: number }>();
		expect(seeded?.n).toBe(TABLE_COUNT);
	});
});
