import { describe, expect, it } from 'vitest';
import {
	currentAnswers,
	getCurrentAnswers,
	getRenderBudget,
	insertQueuedImageIfIdle,
	getResetAt,
	markFailed,
	markStored,
	resetTable,
	rowToAnswers,
	saveAnswer
} from './room';
import { fakeD1 } from './fake-d1';

describe('rowToAnswers', () => {
	it('round-trips a written answer back to the same keys and text', () => {
		const rows = [
			{
				id: 'a1',
				question_id: 'q1',
				keys: JSON.stringify(['a', 'b']),
				text: JSON.stringify({ a: 'note' }),
				push_reply: null,
				actor: 'table',
				source: 'tap',
				supersedes_id: null,
				created_at: 123
			}
		];
		expect(rowToAnswers(rows)).toEqual([
			{
				id: 'a1',
				questionId: 'q1',
				keys: ['a', 'b'],
				text: { a: 'note' },
				pushReply: undefined,
				actor: 'table',
				source: 'tap',
				supersedesId: null,
				createdAt: 123
			}
		]);
	});

	it('drops a row whose keys column is not a JSON string array, rather than throwing', () => {
		const base = { text: null, push_reply: null, actor: 'table', source: 'tap', supersedes_id: null };
		const rows = [
			{ id: 'g', question_id: 'good', keys: JSON.stringify(['x']), created_at: 1, ...base },
			{ id: 'b1', question_id: 'bad-not-array', keys: JSON.stringify({ not: 'an array' }), created_at: 2, ...base },
			{ id: 'b2', question_id: 'bad-not-json', keys: 'not json at all', created_at: 3, ...base }
		];
		const result = rowToAnswers(rows);
		expect(result).toHaveLength(1);
		expect(result[0].questionId).toBe('good');
	});
});

describe('currentAnswers', () => {
	it('latest-revision-wins: an admin edit with a later createdAt supersedes the table row', () => {
		const rows = rowToAnswers([
			{
				id: 'a1',
				question_id: 'q1',
				keys: JSON.stringify(['x']),
				text: null,
				push_reply: null,
				actor: 'table',
				source: 'tap',
				supersedes_id: null,
				created_at: 100
			},
			{
				id: 'a2',
				question_id: 'q1',
				keys: JSON.stringify(['y']),
				text: null,
				push_reply: null,
				actor: 'admin',
				source: 'admin',
				supersedes_id: 'a1',
				created_at: 200
			}
		]);
		const current = currentAnswers(rows);
		expect(current.get('q1')?.id).toBe('a2');
		expect(current.get('q1')?.keys).toEqual(['y']);
	});

	it('an out-of-order read (older row processed last) still resolves to the newest createdAt', () => {
		const rows = rowToAnswers([
			{
				id: 'a2',
				question_id: 'q1',
				keys: JSON.stringify(['newer']),
				text: null,
				push_reply: null,
				actor: 'table',
				source: 'tap',
				supersedes_id: null,
				created_at: 200
			},
			{
				id: 'a1',
				question_id: 'q1',
				keys: JSON.stringify(['older']),
				text: null,
				push_reply: null,
				actor: 'table',
				source: 'tap',
				supersedes_id: null,
				created_at: 100
			}
		]);
		expect(currentAnswers(rows).get('q1')?.keys).toEqual(['newer']);
	});
});

/**
 * `currentAnswers`'s tie-break is a strict `>`, so two rows sharing a
 * millisecond would keep the OLDER one as current — exactly the case an
 * append-only edit produces (an admin correction landing right behind a
 * table's own save). `monotonicNow()` is what makes that impossible; this
 * drives the real insert path rather than hand-written timestamps, so it
 * would catch a regression back to `Date.now()`.
 */
describe('append-only writes never share a timestamp', () => {
	it('two saves issued back to back resolve to the second one', async () => {
		const db = fakeD1();
		await saveAnswer(db, { eventId: 'e', table: 3, questionId: 'q4', keys: ['first'] });
		await saveAnswer(db, { eventId: 'e', table: 3, questionId: 'q4', keys: ['second'], actor: 'admin', source: 'admin' });

		const current = await getCurrentAnswers(db, 'e', 3);
		expect(current).toHaveLength(1);
		expect(current[0].keys).toEqual(['second']);
	});

	it('a run of same-millisecond writes comes back strictly ordered', async () => {
		const db = fakeD1();
		for (let i = 0; i < 12; i++) {
			await saveAnswer(db, { eventId: 'e', table: 4, questionId: `q${i}`, keys: [String(i)] });
		}
		const rows = await getCurrentAnswers(db, 'e', 4);
		const stamps = rows.map((r) => r.createdAt);
		expect(new Set(stamps).size).toBe(stamps.length);
	});
});

/**
 * The cross-isolate idempotent submit. `insertQueuedImage`'s callers
 * read-then-write, which two isolates can both pass before either writes —
 * the double-tap that queued two full generation sets for one table. The
 * check and the write have to be one statement, which is what this drives
 * against real SQLite.
 */
describe('insertQueuedImageIfIdle', () => {
	const attempt = (over: Record<string, unknown> = {}) => ({
		eventId: 'e',
		table: 5,
		zoneKey: 'library',
		promptId: 'p-1',
		prompt: 'a prompt',
		model: 'test-model',
		...over
	});

	it('inserts the first attempt for a table+zone', async () => {
		const db = fakeD1();
		const row = await insertQueuedImageIfIdle(db, attempt());
		expect(row?.state).toBe('queued');
	});

	it('refuses a SECOND attempt while the first is still live', async () => {
		const db = fakeD1();
		const first = await insertQueuedImageIfIdle(db, attempt());
		const second = await insertQueuedImageIfIdle(db, attempt());
		expect(first).not.toBeNull();
		expect(second).toBeNull();
	});

	it('allows a fresh attempt once the previous one has finished', async () => {
		const db = fakeD1();
		const first = await insertQueuedImageIfIdle(db, attempt());
		// stored is terminal — a regenerate is meant to supersede it.
		await db.prepare(`UPDATE image SET state = 'requested' WHERE id = ?`).bind(first!.id).run();
		await markStored(db, first!.id, 'k');
		expect(await insertQueuedImageIfIdle(db, attempt())).not.toBeNull();
	});

	it('allows a fresh attempt after a failure', async () => {
		const db = fakeD1();
		const first = await insertQueuedImageIfIdle(db, attempt());
		await markFailed(db, first!.id, 'content policy');
		expect(await insertQueuedImageIfIdle(db, attempt())).not.toBeNull();
	});

	it('a live attempt in ONE zone does not block another zone', async () => {
		const db = fakeD1();
		await insertQueuedImageIfIdle(db, attempt());
		expect(await insertQueuedImageIfIdle(db, attempt({ zoneKey: 'studio' }))).not.toBeNull();
	});

	it('a pre-reset attempt never blocks a post-reset one', async () => {
		const db = fakeD1();
		const old = await insertQueuedImageIfIdle(db, attempt());
		expect(old).not.toBeNull();
		// Watermark set after that row: it is history, not a live attempt.
		expect(await insertQueuedImageIfIdle(db, attempt(), old!.createdAt)).not.toBeNull();
	});
});

describe('getRenderBudget', () => {
	it('counts rows since the reset watermark and reports the newest', async () => {
		const db = fakeD1();
		const a = await insertQueuedImageIfIdle(db, {
			eventId: 'e',
			table: 9,
			zoneKey: 'library',
			promptId: 'p',
			prompt: 'x',
			model: 'm'
		});
		const b = await insertQueuedImageIfIdle(db, {
			eventId: 'e',
			table: 9,
			zoneKey: 'studio',
			promptId: 'p',
			prompt: 'x',
			model: 'm'
		});
		const all = await getRenderBudget(db, 'e', 9);
		expect(all.used).toBe(2);
		expect(all.lastRenderAt).toBe(b!.createdAt);

		// A reset gives the table its budget back.
		const afterReset = await getRenderBudget(db, 'e', 9, b!.createdAt);
		expect(afterReset.used).toBe(0);
		expect(afterReset.lastRenderAt).toBe(0);
		expect(a!.createdAt).toBeLessThan(b!.createdAt);
	});

	it('a table that has never drawn has spent nothing', async () => {
		expect(await getRenderBudget(fakeD1(), 'e', 2)).toEqual({ used: 0, lastRenderAt: 0 });
	});
});

describe('resetTable', () => {
	it('abandons renders already in flight, so no ticker keeps paying for them', async () => {
		const db = fakeD1();
		const queued = await insertQueuedImageIfIdle(db, {
			eventId: 'e',
			table: 6,
			zoneKey: 'library',
			promptId: 'p',
			prompt: 'x',
			model: 'm'
		});
		await resetTable(db, 'e', 6);

		const after = await db
			.prepare(`SELECT state, error FROM image WHERE id = ?`)
			.bind(queued!.id)
			.first<{ state: string; error: string | null }>();
		// The watermark only filters READS. A pending row left pending was
		// still walked by the admin poll's ticker and still submitted to fal.
		expect(after?.state).toBe('failed');
		expect(after?.error).toContain('reset');
	});

	it('leaves a render that already landed alone', async () => {
		const db = fakeD1();
		const row = await insertQueuedImageIfIdle(db, {
			eventId: 'e',
			table: 6,
			zoneKey: 'studio',
			promptId: 'p',
			prompt: 'x',
			model: 'm'
		});
		await db.prepare(`UPDATE image SET state = 'requested' WHERE id = ?`).bind(row!.id).run();
		await markStored(db, row!.id, 'k');
		await resetTable(db, 'e', 6);

		const after = await db.prepare(`SELECT state FROM image WHERE id = ?`).bind(row!.id).first<{ state: string }>();
		expect(after?.state).toBe('stored');
	});

	it('writes a watermark newer than everything before it', async () => {
		const db = fakeD1();
		await saveAnswer(db, { eventId: 'e', table: 6, questionId: 'q2', keys: ['a'] });
		await resetTable(db, 'e', 6);
		const since = await getResetAt(db, 'e', 6);
		const rows = await getCurrentAnswers(db, 'e', 6);
		expect(rows.every((r) => r.createdAt < since)).toBe(true);
	});
});
