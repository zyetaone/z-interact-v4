import { describe, expect, it } from 'vitest';
import { currentAnswers, getCurrentAnswers, rowToAnswers, saveAnswer } from './room';
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
