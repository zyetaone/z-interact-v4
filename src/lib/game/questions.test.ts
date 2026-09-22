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

	/**
	 * NAMED, not "every question except q11". q8's push ("Why that much?")
	 * was removed 22 Sep because its answer is already a percentage, and a
	 * rule phrased as an exception list would have gone on passing while a
	 * second push vanished by accident. This fails either way: a push that
	 * disappears AND a push that reappears.
	 */
	it('carries a push line on q2 only — the other three take words through an option or not at all', () => {
		const withPush = QUESTIONS.filter((q) => q.push).map((q) => q.id);
		expect(withPush).toEqual(['q2']);
		for (const id of ['q8', 'q5c', 'q6r']) {
			expect(QUESTIONS.find((q) => q.id === id)?.pushCapturesReply, id).toBeUndefined();
		}
	});

	/**
	 * The two programme questions each end in an open option, and its text IS
	 * the layer. q6r's arrived on 22 Sep replacing a push whose reply the hero
	 * composer never read; this asserts the shape both must keep, because an
	 * open option without `{text}` composes nothing and says nothing.
	 */
	it('ends q5c and q6r with an open option whose fragment is the table\'s own words', () => {
		for (const id of ['q5c', 'q6r']) {
			const options = QUESTIONS.find((q) => q.id === id)!.options;
			const last = options[options.length - 1];
			expect(last.open, id).toBe(true);
			expect(last.promptFragment, id).toBe('{text}');
			expect(options.filter((o) => o.open), `${id} open count`).toHaveLength(1);
		}
	});

	/**
	 * THE SCREEN IS THE PICTURE, NOT THE CAPTION.
	 *
	 * Every option renders as an illustrated 1:1 tile with its label
	 * beneath it, so a label that re-describes the picture is text the
	 * table reads instead of looking. The em-dash glosses were up to 108
	 * characters ("Stark and clinical — pure white, shadowless; seamless
	 * resin, glass, polished steel; shiny and flawless") — three lines of
	 * caption under a thumbnail, six times per screen.
	 *
	 * These are ceilings on the words a table READS. `promptFragment` is
	 * deliberately not capped here: it is what the model reads, it is not
	 * on screen, and shortening it would change what gets drawn. That is
	 * the whole distinction this test exists to hold.
	 */
	it('keeps every word on screen short enough to scan', () => {
		for (const q of QUESTIONS) {
			// 60, not 48: q5c's stem carries "in a centaur organisation" at the
			// owner's request (21 Sep 19:42) after being trimmed out earlier the
			// same evening. The ceiling exists to stop a stem becoming a
			// paragraph, not to win an argument with the person who writes them.
			expect(q.prompt.length, `${q.id} stem`).toBeLessThanOrEqual(60);
			if (q.lead) expect(q.lead.length, `${q.id} lead`).toBeLessThanOrEqual(72);
			if (q.push) expect(q.push.length, `${q.id} push`).toBeLessThanOrEqual(56);
			for (const o of q.options) {
				expect(o.label.length, `${q.id}:${o.key}`).toBeLessThanOrEqual(32);
				expect(o.label, `${q.id}:${o.key}`).not.toContain('—');
			}
			for (const o of q.and?.options ?? []) {
				expect(o.label.length, `${q.id}:and:${o.key}`).toBeLessThanOrEqual(24);
			}
		}
	});

	it('leaves the drawn fragments long — they are not on screen', () => {
		// The counterweight to the test above: if a future trim reaches the
		// prompt fragments, the renders change and nothing on screen does.
		const longest = Math.max(...QUESTIONS.flatMap((q) => q.options.map((o) => o.promptFragment.length)));
		expect(longest).toBeGreaterThan(100);
	});

	/**
	 * SHAPE, NOT THE SENTENCE. This assertion has now been broken twice by
	 * ordinary rewording ("What have we missed?" -> "Any other flights of
	 * fancy?"), and each time it failed it was the TEST that was wrong. What
	 * matters about the wildcard is that it is one open question with one
	 * free-text option, which is what the composers and the review screen
	 * rely on; its wording belongs to whoever writes the questions.
	 */
	it('asks the wildcard as one open question with one free-text option', () => {
		expect(WILDCARD.prompt.trim()).toMatch(/\?$/);
		expect(WILDCARD.options).toHaveLength(1);
		expect(WILDCARD.options[0].open).toBe(true);
		expect(WILDCARD.options[0].promptFragment).toContain('{text}');
	});
});
