/**
 * The V4 set's own invariants — the ones the image model and the answer
 * store depend on, beyond the import-time shape guards in `questions.ts`.
 */
import { describe, expect, it } from 'vitest';
import { PROPOSED_QUESTIONS, QUESTIONS, WILDCARD, andId } from './questions';

const ALL = [...QUESTIONS, ...PROPOSED_QUESTIONS];

describe('V4 option fragments', () => {
	it('every option, And option and the wildcard carries a non-empty promptFragment', () => {
		for (const q of ALL) {
			for (const o of q.options) expect(o.promptFragment.trim().length, `${q.id}/${o.key}`).toBeGreaterThan(0);
			for (const o of q.and?.options ?? []) expect(o.promptFragment.trim().length, `${q.id}:and/${o.key}`).toBeGreaterThan(0);
		}
		for (const o of WILDCARD.options) expect(o.promptFragment.trim().length).toBeGreaterThan(0);
	});

	it('only an open option carries a {text} splice point', () => {
		for (const q of ALL) {
			for (const o of q.options) expect(o.promptFragment.includes('{text}'), `${q.id}/${o.key}`).toBe(!!o.open);
			for (const o of q.and?.options ?? []) expect(o.promptFragment).not.toContain('{text}');
		}
		expect(WILDCARD.options[0].open).toBe(true);
		expect(WILDCARD.options[0].promptFragment).toContain('{text}');
	});

	it('no fragment names a lens — fragments must read the same under every future', () => {
		const lensWords = /\b(garden city|arcology|solarpunk|cyberpunk|neo-seoul|broadacre|retrofutur|deco)\b/i;
		for (const q of ALL) {
			for (const o of [...q.options, ...(q.and?.options ?? [])]) expect(o.promptFragment, `${q.id}/${o.key}`).not.toMatch(lensWords);
		}
	});
});

describe('V4 ids', () => {
	it('every answer id in the set is unique: questions, their And rows, the proposal and the wildcard', () => {
		const ids = [...ALL.map((q) => q.id), ...ALL.filter((q) => q.and).map((q) => andId(q.id)), WILDCARD.id];
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('never reuses a retired V3 id (q1 is the era chip, q4/q5/q6/q9 are gone)', () => {
		for (const id of ['q1', 'q4', 'q5', 'q6', 'q9']) expect(ALL.some((q) => q.id === id), id).toBe(false);
	});

	it('option keys are unique within each question and within each And row', () => {
		for (const q of ALL) {
			const keys = q.options.map((o) => o.key);
			expect(new Set(keys).size, q.id).toBe(keys.length);
			const andKeys = q.and?.options.map((o) => o.key) ?? [];
			expect(new Set(andKeys).size, `${q.id}:and`).toBe(andKeys.length);
		}
	});

	it('an And id is its parent plus :and, so a row can always be traced back', () => {
		expect(andId('q2')).toBe('q2:and');
	});
});

describe('V4 shape', () => {
	it('is single-select everywhere except the three-words pick', () => {
		for (const q of QUESTIONS) {
			if (q.id === 'q11') expect(q.select).toEqual({ kind: 'pick', n: 3 });
			else expect(q.select).toEqual({ kind: 'one' });
		}
	});

	it('gives every question a push line except the three-words pick, in her words', () => {
		for (const q of QUESTIONS) expect(!!q.push, q.id).toBe(q.id !== 'q11');
		expect(QUESTIONS.find((q) => q.id === 'q8')?.push).toBe(
			'Singapore is hot and humid. How does your greenery cool a mind as well as a body?'
		);
	});

	it('asks the wildcard as "What have we missed?"', () => {
		expect(WILDCARD.prompt).toBe('What have we missed?');
	});
});
