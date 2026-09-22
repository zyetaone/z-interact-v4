/**
 * WHERE THE ROOM AGREED AND WHERE IT SPLIT.
 *
 * Carried from v3, whose presenter computed "most divisive" and "strongest
 * consensus" and put them on the wall. It is the one pair of numbers on the
 * readout a facilitator can say out loud: everything else answers "is the
 * event working", these answer "what did the room decide".
 *
 * The rule worth pinning is how DIVISIVE is measured — the gap between the
 * top two options, not the leader's share. A five-option question whose
 * leader took 30% is scattered, not divided, and calling it a split would
 * put a false sentence in someone's mouth on stage.
 */
import { describe, expect, it } from 'vitest';
import { summarise } from './analytics';
import { QUESTIONS, WILDCARD } from '$lib/game/questions';

const Q = QUESTIONS[0]; // q2 — materials, four options
const Q2 = QUESTIONS[1]; // q8 — outdoors, three options

function room(picks: { table: number; q: string; key: string }[]) {
	const byTable = new Map<number, { table: number; answers: { questionId: string; keys: string[]; createdAt: number }[] }>();
	for (const p of picks) {
		const row = byTable.get(p.table) ?? { table: p.table, answers: [] };
		row.answers.push({ questionId: p.q, keys: [p.key], createdAt: 1 });
		byTable.set(p.table, row);
	}
	return summarise({
		rows: [...byTable.values()].map((r) => ({ ...r, futureKey: null, submittedAt: null, images: [] })) as never,
		questions: QUESTIONS,
		wildcard: WILDCARD,
		futures: [],
		maxRenders: 12,
		now: Date.now()
	} as never);
}

describe('the room verdict', () => {
	it('says nothing at all from a single table', () => {
		const a = room([{ table: 1, q: Q.id, key: Q.options[0].key }]);
		// One table is unanimous with itself and divided by nothing. Reporting
		// either would be a sentence about a sample of one.
		expect(a.consensus).toBeNull();
		expect(a.divisive).toBeNull();
	});

	it('names the question the room agreed on', () => {
		const picks = [1, 2, 3, 4].map((table) => ({ table, q: Q.id, key: Q.options[0].key }));
		const a = room(picks);
		expect(a.consensus?.questionId).toBe(Q.id);
		expect(a.consensus?.label).toBe(Q.options[0].label);
		// `share` is a FRACTION here, not a percent — the page formats it.
		expect(a.consensus?.share).toBe(1);
	});

	it('a unanimous question is a consensus, never a split', () => {
		const picks = [1, 2, 3].map((table) => ({ table, q: Q.id, key: Q.options[0].key }));
		const a = room(picks);
		expect(a.consensus?.questionId).toBe(Q.id);
		expect(a.divisive).toBeNull();
	});

	it('measures a split by the gap between the top two, not by the leader', () => {
		const a = room([
			// q2: an even 2/2 split — the divisive one, gap 0.
			{ table: 1, q: Q.id, key: Q.options[0].key },
			{ table: 2, q: Q.id, key: Q.options[0].key },
			{ table: 3, q: Q.id, key: Q.options[1].key },
			{ table: 4, q: Q.id, key: Q.options[1].key },
			// q8: 3 one way, 1 the other — a clear leader, gap 50.
			{ table: 1, q: Q2.id, key: Q2.options[0].key },
			{ table: 2, q: Q2.id, key: Q2.options[0].key },
			{ table: 3, q: Q2.id, key: Q2.options[0].key },
			{ table: 4, q: Q2.id, key: Q2.options[1].key }
		]);
		expect(a.divisive?.questionId).toBe(Q.id);
		expect(a.divisive?.share).toBe(0.5);
		expect(a.divisive?.againstShare).toBe(0.5);
		// ...and the same room's agreement is the OTHER question.
		expect(a.consensus?.questionId).toBe(Q2.id);
		expect(a.consensus?.share).toBe(0.75);
	});

	it('carries both sides of a split, so the line can be read aloud', () => {
		const a = room([
			{ table: 1, q: Q.id, key: Q.options[0].key },
			{ table: 2, q: Q.id, key: Q.options[1].key }
		]);
		expect(a.divisive?.label).toBeTruthy();
		expect(a.divisive?.againstLabel).toBeTruthy();
		expect(a.divisive?.label).not.toBe(a.divisive?.againstLabel);
	});
});
