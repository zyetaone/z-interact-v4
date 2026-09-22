/**
 * `/health` — the gate and the numbers.
 *
 * The gate is the half worth a test: it fails closed, so an unset
 * `ADMIN_TOKEN` must reject rather than open the route. `secretEquals`
 * already has its own tests; what this adds is that the route actually
 * calls it, and on the right value.
 */
import { describe, expect, it } from 'vitest';
import { fakeD1 } from '$lib/server/fake-d1';
import { claimQueued, insertPrompt, insertQueuedImage, markFailed, markRequested, seedTables, setBeat } from '$lib/server/room';
import { TABLE_COUNT } from '$lib/game/questions';
import { GET } from './+server';

const EVENT = 'health-test';
const TOKEN = 'desk-token';

function call(db: D1Database, token: string | null, env: Record<string, unknown> = {}) {
	const url = new URL(`https://example.test/health${token === null ? '' : `?token=${encodeURIComponent(token)}`}`);
	const platform = { env: { DB: db, EVENT_ID: EVENT, ADMIN_TOKEN: TOKEN, ...env } } as unknown as App.Platform;
	return (GET as (arg: { url: URL; platform: App.Platform }) => Promise<Response>)({ url, platform });
}

describe('/health gate', () => {
	/*
	 * `/health` answers anyone (owner decision 22 Sep, `ADMIN_SCREENS_OPEN`).
	 * It is a read-only ops check that ticks NOTHING and spends nothing — it
	 * reports counts — so it moved onto the same switch as the screens
	 * rather than keeping a token somebody has to find before they can curl
	 * it. This test is inverted rather than deleted so the change is visible
	 * to whoever flips the switch back.
	 */
	it('answers any caller, with or without a token, because the gate is open', async () => {
		const db = fakeD1();

		expect((await call(db, 'wrong')).status).toBe(200);
		expect((await call(db, null)).status).toBe(200);
		expect((await call(db, '', { ADMIN_TOKEN: undefined })).status).toBe(200);
		expect((await call(db, TOKEN, { ADMIN_TOKEN: undefined })).status).toBe(200);

		const body = (await (await call(db, null)).json()) as { ok: boolean };
		expect(body.ok).toBe(true);
	});
});

describe('/health body', () => {
	it('reports beat, pending, recent failures, submitted and the event id', async () => {
		const db = fakeD1();
		await seedTables(db, EVENT, TABLE_COUNT);
		await setBeat(db, EVENT, 'focus', 7);

		const promptId = await insertPrompt(db, {
			eventId: EVENT,
			table: 1,
			mood: 'm',
			material: 'mat',
			programme: 'p',
			feel: 'f',
			composed: 'a composed prompt',
			actor: 'table'
		});
		const queued = await insertQueuedImage(db, { eventId: EVENT, table: 1, zoneKey: 'library', promptId, prompt: 'p', model: 'm' });
		const doomed = await insertQueuedImage(db, { eventId: EVENT, table: 1, zoneKey: 'studio', promptId, prompt: 'p', model: 'm' });
		await claimQueued(db, doomed.id);
		await markRequested(db, doomed.id, 'req-1');
		await markFailed(db, doomed.id, 'provider said no');

		// One table past finishTable.
		await db.prepare(`UPDATE event_table SET submitted_at = ? WHERE event_id = ? AND table_no = 1`).bind(Date.now(), EVENT).run();

		const res = await call(db, TOKEN);
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;

		expect(body).toMatchObject({
			ok: true,
			eventId: EVENT,
			beat: 'focus',
			focusTable: 7,
			pending: 1,
			failedRecent: 1,
			submitted: 1,
			tables: TABLE_COUNT
		});
		// The queued row is the pending one; the failed row is not double-counted.
		expect(queued.state).toBe('queued');
	});

	it('does not count a failure older than the window', async () => {
		const db = fakeD1();
		await seedTables(db, EVENT, TABLE_COUNT);
		const promptId = await insertPrompt(db, {
			eventId: EVENT,
			table: 2,
			mood: 'm',
			material: 'mat',
			programme: 'p',
			feel: 'f',
			composed: 'a composed prompt',
			actor: 'table'
		});
		const row = await insertQueuedImage(db, { eventId: EVENT, table: 2, zoneKey: 'library', promptId, prompt: 'p', model: 'm' });
		await claimQueued(db, row.id);
		await markRequested(db, row.id, 'req-old');
		await markFailed(db, row.id, 'an hour ago');
		await db
			.prepare(`UPDATE image SET created_at = ? WHERE id = ?`)
			.bind(Date.now() - 60 * 60 * 1000, row.id)
			.run();

		const body = (await (await call(db, TOKEN)).json()) as { failedRecent: number; pending: number };
		expect(body.failedRecent).toBe(0);
		expect(body.pending).toBe(0);
	});
});
