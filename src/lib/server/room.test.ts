import { describe, expect, it } from 'vitest';
import { rowToAnswers } from './room';

describe('rowToAnswers', () => {
	it('round-trips a written answer back to the same keys and text', () => {
		const rows = [
			{
				question_id: 'q1',
				keys: JSON.stringify(['a', 'b']),
				text: JSON.stringify({ a: 'note' }),
				updated_at: 123
			}
		];
		expect(rowToAnswers(rows)).toEqual([
			{ questionId: 'q1', keys: ['a', 'b'], text: { a: 'note' }, updatedAt: 123 }
		]);
	});

	it('drops a row whose keys column is not a JSON string array, rather than throwing', () => {
		const rows = [
			{ question_id: 'good', keys: JSON.stringify(['x']), text: null, updated_at: 1 },
			{ question_id: 'bad-not-array', keys: JSON.stringify({ not: 'an array' }), text: null, updated_at: 2 },
			{ question_id: 'bad-not-json', keys: 'not json at all', text: null, updated_at: 3 }
		];
		const result = rowToAnswers(rows);
		expect(result).toHaveLength(1);
		expect(result[0].questionId).toBe('good');
	});

	it('omits `text` when the column is null', () => {
		const rows = [{ question_id: 'q1', keys: JSON.stringify(['a']), text: null, updated_at: 1 }];
		expect(rowToAnswers(rows)[0].text).toBeUndefined();
	});
});
