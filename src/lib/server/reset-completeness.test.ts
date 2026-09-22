/**
 * RESET HOLDS EVERY ROW, AND LEAVES NOTHING OF THE OLD RUN READABLE.
 *
 * Those are two promises, not one, and a reset is only correct if both
 * hold. The desk's reset is a watermark precisely so the event's record
 * survives — but a watermark only frees the room if EVERY read applies it.
 * Miss one and the table gets a fresh start with a ghost in it.
 *
 * `getLatestPrompt` was the one that missed it, found 22 Sep auditing the
 * routes. Three call sites read it:
 *
 *   the phone's poll   — showed the PREVIOUS run's prompt in the review
 *                        panel, with that run's `editedByTable` flag
 *   queueGeneration    — linked a fresh run's first prompt by
 *                        `supersedes_id` to the room that was reset away
 *   retryZone          — worst: with no sidecar it composed the OLD prompt
 *                        into a NEW render, spending real money drawing the
 *                        previous room's answers
 *
 * This file walks one table through a full run, resets it, and asserts both
 * halves for every table that a reset has to free.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeD1 } from './fake-d1';
import {
	claimQueued,
	getCurrentAnswersSince,
	getCurrentImageSince,
	getRenderBudget,
	getResetAt,
	insertPrompt,
	insertQueuedImage,
	markRequested,
	markStored,
	resetTable,
	saveAnswer,
	seedTables
} from './room';
import { getLatestPrompt } from '../../routes/t/[table]/prompt-store';
import { getNarrative, insertNarrative } from '../../routes/t/[table]/narrative';

const EVENT = 'reset-completeness';
const T = 4;
let db: D1Database;

async function fullRun(marker: string) {
	await saveAnswer(db, { eventId: EVENT, table: T, questionId: 'q2', keys: ['warm-earthy'], actor: 'table', source: 'tap' });
	const promptId = await insertPrompt(db, {
		eventId: EVENT, table: T, mood: marker, material: 'm', programme: 'p', feel: 'f',
		composed: `composed-${marker}`, actor: 'table'
	});
	const row = await insertQueuedImage(db, {
		eventId: EVENT, table: T, zoneKey: 'workspace', promptId, prompt: 'p', model: 'test'
	});
	await claimQueued(db, row.id);
	await markRequested(db, row.id, `req-${row.id}`);
	await markStored(db, row.id, `${EVENT}/${T}/${marker}.jpg`);
	await insertNarrative(db, { eventId: EVENT, table: T, text: `narrative-${marker}`, model: 'test' });
	await db.prepare(`UPDATE event_table SET submitted_at = ? WHERE event_id = ? AND table_no = ?`)
		.bind(Date.now(), EVENT, T).run();
	return promptId;
}

async function count(table: string) {
	const r = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE event_id = ?`).bind(EVENT).first<{ n: number }>();
	return r?.n ?? 0;
}

describe('a reset room', () => {
	beforeEach(async () => {
		db = fakeD1();
		await seedTables(db, EVENT, 20);
		await fullRun('first');
	});

	it('HOLDS ALL DATA — every row from the old run is still there', async () => {
		const before = {
			answer: await count('answer'),
			prompt: await count('prompt'),
			image: await count('image'),
			narrative: await count('narrative')
		};
		await resetTable(db, EVENT, T);

		expect(await count('answer')).toBe(before.answer);
		expect(await count('prompt')).toBe(before.prompt);
		expect(await count('image')).toBe(before.image);
		expect(await count('narrative')).toBe(before.narrative);
		// And they are all still in the archive path, which is what
		// `/admin/photos` and `wrangler d1 export` read.
		expect(before.image).toBeGreaterThan(0);
	});

	it('MAKES SPACE — nothing of the old run reads back', async () => {
		await resetTable(db, EVENT, T);
		const since = await getResetAt(db, EVENT, T);

		expect(await getCurrentAnswersSince(db, EVENT, T, since)).toHaveLength(0);
		expect(await getCurrentImageSince(db, EVENT, T, 'workspace', since)).toBeNull();
		expect(await getNarrative(db, EVENT, T, since)).toBeNull();
		// THE ONE THAT WAS WRONG. Unscoped, this returned `composed-first`.
		expect(await getLatestPrompt(db, EVENT, T, since)).toBeNull();
		// ...and the allowance is back, which is the point of resetting.
		expect((await getRenderBudget(db, EVENT, T, since)).used).toBe(0);
	});

	it('a second run starts a fresh lineage, not an edit of the room that was reset away', async () => {
		await resetTable(db, EVENT, T);
		const since = await getResetAt(db, EVENT, T);
		await fullRun('second');

		const now = await getLatestPrompt(db, EVENT, T, since);
		expect(now?.composed).toBe('composed-second');
		// Both runs' prompts coexist in the table — held, not overwritten.
		expect(await count('prompt')).toBe(2);
	});

	it('leaves every other table untouched', async () => {
		await fullRun('first'); // table 4 again
		await saveAnswer(db, { eventId: EVENT, table: 9, questionId: 'q2', keys: ['soft-pastel'], actor: 'table', source: 'tap' });
		await resetTable(db, EVENT, T);

		const otherSince = await getResetAt(db, EVENT, 9);
		expect(await getCurrentAnswersSince(db, EVENT, 9, otherSince)).toHaveLength(1);
	});
});
