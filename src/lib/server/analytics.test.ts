/**
 * The readout's arithmetic, on rows rather than on a database.
 *
 * The cases that matter are the ones a naive `GROUP BY` gets wrong: a
 * multi-select question whose shares sum past 100, an option nobody chose,
 * spend that the export cannot see, and a room where nothing has happened
 * yet.
 */
import { describe, it, expect } from 'vitest';
import { summarise, reasonOf } from './analytics';
import type { ExportTableRow } from './room';
import type { Question, WildcardQuestion } from '$lib/game/questions';
import type { Future } from '$lib/game/futures';

const Q: Question = {
	id: 'q2',
	prompt: 'The material world',
	options: [
		{ key: 'warm', label: 'Warm', promptFragment: 'warm' },
		{ key: 'cold', label: 'Cold', promptFragment: 'cold' },
		{ key: 'nobody', label: 'Nobody picks me', promptFragment: 'unloved' }
	],
	layer: 'materialsAndLight',
	select: 'one',
	diamond: true
} as unknown as Question;

const WILD: WildcardQuestion = { id: 'wildcard', options: [{ key: 'text', label: 'Anything', open: true, promptFragment: '{text}' }] } as WildcardQuestion;

const FUTS: Future[] = [
	{ key: 'garden-city', name: 'The garden city' } as Future,
	{ key: 'neo-seoul', name: 'The dense and lit city' } as Future
];

function row(table: number, over: Partial<ExportTableRow> = {}): ExportTableRow {
	return {
		table,
		futureKey: null,
		submittedAt: null,
		resetAt: 0,
		answers: [],
		images: [],
		...over
	} as ExportTableRow;
}

const answer = (questionId: string, keys: string[], over: Record<string, unknown> = {}) =>
	({ id: `a-${questionId}`, questionId, keys, actor: 'table', source: 'phone', supersedesId: null, createdAt: 1_000, ...over }) as never;

const image = (zoneKey: string, state: string, over: Record<string, unknown> = {}) =>
	({
		id: `i-${zoneKey}`,
		zoneKey,
		zone: zoneKey,
		r2Key: null,
		state,
		error: null,
		falRequestId: null,
		createdAt: 2_000,
		submittedPrompt: null,
		referenceUrls: [],
		attempt: 1,
		prompt: null,
		...over
	}) as never;

const base = { questions: [Q], wildcard: WILD, futures: FUTS, maxRenders: 12, now: 9_999 };

describe('what the room answered', () => {
	it('counts the current answer per table and keeps an option nobody chose, at zero', () => {
		const a = summarise({ ...base, rows: [row(1, { answers: [answer('q2', ['warm'])] }), row(2, { answers: [answer('q2', ['warm'])] }), row(3)] });
		const q = a.questions[0];
		expect(q.answered).toBe(2);
		expect(q.options.map((o) => [o.key, o.count])).toEqual([
			['warm', 2],
			['cold', 0],
			['nobody', 0]
		]);
		expect(q.options[0].share).toBe(1);
	});

	it('lets a multi-select sum past 100%, because the denominator is tables and not picks', () => {
		const a = summarise({ ...base, rows: [row(1, { answers: [answer('q2', ['warm', 'cold'])] })] });
		const q = a.questions[0];
		expect(q.answered).toBe(1);
		expect(q.options.find((o) => o.key === 'warm')!.share + q.options.find((o) => o.key === 'cold')!.share).toBe(2);
	});

	it('gathers what tables typed — the open option AND the push reply, both being the tables words', () => {
		const a = summarise({
			...base,
			rows: [row(4, { answers: [answer('q2', ['warm'], { text: { warm: '  brass  ' }, pushReply: 'we argued about it' })] })]
		});
		expect(a.questions[0].replies).toEqual([
			{ table: 4, text: 'brass' },
			{ table: 4, text: 'we argued about it' }
		]);
	});

	it('splits the lenses, names the tables on each, and keeps an unchosen lens visible', () => {
		const a = summarise({ ...base, rows: [row(1, { futureKey: 'neo-seoul' }), row(2, { futureKey: 'neo-seoul' }), row(3)] });
		expect(a.lenses).toEqual([
			{ key: 'neo-seoul', name: 'The dense and lit city', count: 2, tables: [1, 2] },
			{ key: 'garden-city', name: 'The garden city', count: 0, tables: [] }
		]);
	});
});

describe('is the room moving', () => {
	it('separates started from submitted, and counts tiles by state', () => {
		const a = summarise({
			...base,
			rows: [
				row(1, { answers: [answer('q2', ['warm'])], submittedAt: 61_000, images: [image('studio', 'stored'), image('plaza', 'failed')] }),
				row(2, { answers: [answer('q2', ['cold'])] }),
				row(3)
			]
		});
		expect(a.totals).toEqual({ tables: 3, started: 2, submitted: 1, stored: 1, pending: 0, failed: 1 });
		expect(a.tables[0].minutesToSubmit).toBe(1);
		expect(a.tables[1].minutesToSubmit).toBeNull();
	});

	it('treats a done tile as stored and anything unterminal as pending', () => {
		const a = summarise({ ...base, rows: [row(1, { images: [image('a', 'done'), image('b', 'queued'), image('c', 'requested')] })] });
		expect(a.totals.stored).toBe(1);
		expect(a.totals.pending).toBe(2);
	});
});

describe('what it cost', () => {
	it('reads spend from the cap counter, not from the export, so a superseded regenerate still counts', () => {
		const rows = [row(1, { images: [image('studio', 'stored')] })];
		const seen = summarise({ ...base, rows });
		const truth = summarise({ ...base, rows, rendersByTable: new Map([[1, 9]]) });
		expect(seen.spend.renders).toBe(1); // what the export can see
		expect(truth.spend.renders).toBe(9); // what the table actually spent
	});

	it('names the tables that can no longer draw', () => {
		const a = summarise({ ...base, maxRenders: 4, rows: [row(1), row(2)], rendersByTable: new Map([[1, 4], [2, 3]]) });
		expect(a.spend.tablesAtCap).toEqual([1]);
	});

	it('groups failures by reason, commonest first, on the providers first line', () => {
		const a = summarise({
			...base,
			rows: [
				row(1, { images: [image('a', 'failed', { error: 'rate limited\nstack...' }), image('b', 'failed', { error: 'rate limited' })] }),
				row(2, { images: [image('c', 'failed', { error: null })] })
			]
		});
		expect(a.spend.reasons).toEqual([
			{ reason: 'rate limited', count: 2 },
			{ reason: 'unknown', count: 1 }
		]);
	});

	it('trims a novel-length provider error rather than putting it on the screen whole', () => {
		expect(reasonOf('x'.repeat(400))).toHaveLength(120);
	});
});

it('an empty room reports zeroes rather than throwing or dividing by none', () => {
	const a = summarise({ ...base, rows: [] });
	expect(a.totals).toEqual({ tables: 0, started: 0, submitted: 0, stored: 0, pending: 0, failed: 0 });
	expect(a.questions[0].answered).toBe(0);
	expect(a.questions[0].options.every((o) => o.share === 0)).toBe(true);
	expect(a.spend).toEqual({ renders: 0, cap: 12, tablesAtCap: [], reasons: [] });
});
