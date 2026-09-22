/**
 * UNDO ON AN APPEND-ONLY TABLE.
 *
 * v1's undo swapped two URLs in a client store: convincing to a table, gone
 * on reload, invisible to the wall. This restores the earlier render for
 * real, and the way it does that is the thing worth pinning — an INSERT, not
 * an update and not a delete, so the history keeps growing in one direction
 * and `/admin/photos` still lists every picture that ever existed.
 *
 * The other half is spend. Going back to a picture already drawn costs no
 * fal call and no new bytes, so it must not consume the table's allowance.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeD1 } from './fake-d1';
import {
	claimQueued,
	findRestorable,
	getCurrentImage,
	getRenderBudget,
	insertPrompt,
	insertQueuedImage,
	markRequested,
	markStored,
	restoreImages,
	seedTables
} from './room';

const EVENT = 'undo-test';
const ZONES = ['workspace'];
let db: D1Database;

/** One full render, walked to `stored` the real way. Returns its r2 key. */
async function draw(table: number, key: string): Promise<string> {
	const promptId = await insertPrompt(db, {
		eventId: EVENT, table, mood: 'm', material: 'x', programme: 'p', feel: 'f', composed: 'c', actor: 'table'
	});
	const row = await insertQueuedImage(db, {
		eventId: EVENT, table, zoneKey: 'workspace', promptId, prompt: 'p', model: 'test-model'
	});
	await claimQueued(db, row.id);
	await markRequested(db, row.id, `req-${row.id}`);
	await markStored(db, row.id, key);
	return key;
}

async function undo(table: number) {
	const items = await findRestorable(db, EVENT, table, ZONES, 0);
	return restoreImages(db, EVENT, table, items);
}

describe('going back to the last one', () => {
	beforeEach(async () => {
		db = fakeD1();
		await seedTables(db, EVENT, 20);
	});

	it('does nothing when only one picture has been drawn', async () => {
		await draw(1, 'a.jpg');
		expect(await findRestorable(db, EVENT, 1, ZONES, 0)).toHaveLength(0);
	});

	it('puts the earlier picture back on screen', async () => {
		await draw(1, 'first.jpg');
		await draw(1, 'second.jpg');
		expect((await getCurrentImage(db, EVENT, 1, 'workspace'))?.r2Key).toBe('second.jpg');

		expect(await undo(1)).toBe(1);
		expect((await getCurrentImage(db, EVENT, 1, 'workspace'))?.r2Key).toBe('first.jpg');
	});

	it('deletes nothing — every render is still a row', async () => {
		await draw(1, 'first.jpg');
		await draw(1, 'second.jpg');
		await undo(1);
		const all = await db
			.prepare(`SELECT COUNT(*) AS n FROM image WHERE event_id = ? AND table_no = ?`)
			.bind(EVENT, 1)
			.first<{ n: number }>();
		// Two drawn plus one restore row. `/admin/photos` reads this table.
		expect(all?.n).toBe(3);
	});

	it('toggles, the way v1 did: pressing it again returns you to where you were', async () => {
		await draw(1, 'first.jpg');
		await draw(1, 'second.jpg');
		await undo(1);
		expect((await getCurrentImage(db, EVENT, 1, 'workspace'))?.r2Key).toBe('first.jpg');
		await undo(1);
		expect((await getCurrentImage(db, EVENT, 1, 'workspace'))?.r2Key).toBe('second.jpg');
	});

	it('spends nothing — the allowance is unchanged', async () => {
		await draw(1, 'first.jpg');
		await draw(1, 'second.jpg');
		const before = await getRenderBudget(db, EVENT, 1, 0);
		await undo(1);
		const after = await getRenderBudget(db, EVENT, 1, 0);
		// A restore is not a render. If this ever fails, undoing a mistake is
		// costing a table one of the twelve pictures it is allowed.
		expect(after.used).toBe(before.used);
	});

	it('leaves other tables alone', async () => {
		await draw(1, 'first.jpg');
		await draw(1, 'second.jpg');
		await draw(2, 'other.jpg');
		await undo(1);
		expect((await getCurrentImage(db, EVENT, 2, 'workspace'))?.r2Key).toBe('other.jpg');
	});
});
