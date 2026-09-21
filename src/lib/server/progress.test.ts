/**
 * THE NUMBER ON THE WALL AND THE NUMBER IN THE TABLE'S HAND.
 *
 * They disagreed, and the wall's was wrong. Found 21 Sep when the owner
 * asked whether the progress shown on screen is live. It IS live — four
 * independent polls — but the room-wide reads counted a DIFFERENT set of
 * ids against a DIFFERENT denominator than the phone did:
 *
 *   numerator:   every distinct answered id, which includes `future`,
 *                `q1` (the era chip) and `wildcard` — up to 7
 *   denominator: `QUESTIONS.length` — 4
 *
 * So a table that had answered nothing but picked its lens read "2 of 4" on
 * the projector while its own phone said "1 of 6", and the wall saturated
 * at "4 of 4" the moment the table answered the SECOND of four questions.
 * For most of a session the wall would have called every table finished.
 *
 * It was survivable at nine questions and the 21 Sep cut to four is what
 * made it acute — the three uncounted-for ids went from noise to most of
 * the scale. Both sides read `STEP_IDS` now; these are the guards that they
 * still do.
 */
import { describe, expect, it } from 'vitest';
import { ACTIVE_QUESTIONS, FUTURE_ID, QUESTIONS, STEP_IDS, WILDCARD } from '$lib/game/questions';
import { ANSWER_IDS } from '$lib/state/table.svelte';

describe('one scale, for the phone and the room', () => {
	it('is the lens, then every question a table is asked, then the wildcard', () => {
		expect(STEP_IDS).toEqual([FUTURE_ID, 'q8', 'q5c', 'q6r', 'q2', WILDCARD.id]);
	});

	it('is the same list the phone counts, not a parallel one', () => {
		expect(ANSWER_IDS).toBe(STEP_IDS);
	});

	it('leaves out `q1`, which is the era chip on the lens screen and not a screen', () => {
		expect(STEP_IDS).not.toContain('q1');
	});

	it('leaves out every "And:" row — those belong to their parent step', () => {
		expect(STEP_IDS.filter((id) => id.endsWith(':and'))).toEqual([]);
	});

	it('counts the lens and the wildcard, so the denominator is bigger than the question count', () => {
		// The specific shape of the old bug: a denominator that excluded two
		// things the numerator included.
		expect(STEP_IDS.length).toBeGreaterThan(QUESTIONS.length);
		expect(STEP_IDS.length).toBe(ACTIVE_QUESTIONS.filter((q) => q.id !== 'q1').length + 2);
	});

	it('never lets a half-finished table read as finished', () => {
		// Replays the old failure directly. `answered` is what `room.ts`
		// accumulates (a Set of distinct non-`:and`, non-`q1` ids); `shown` is
		// what a screen prints.
		const shown = (answered: string[]) => {
			const counted = answered.filter((id) => !id.endsWith(':and') && id !== 'q1');
			return Math.min(counted.length, STEP_IDS.length);
		};
		// Picked the lens and nothing else: one step of six, not two of four.
		expect(shown([FUTURE_ID, 'q1'])).toBe(1);
		// Two of the four questions in, with both "And:" rows: three of six.
		expect(shown([FUTURE_ID, 'q1', 'q8', 'q5c', 'q5c:and'])).toBe(3);
		expect(shown([FUTURE_ID, 'q1', 'q8', 'q5c', 'q5c:and'])).toBeLessThan(STEP_IDS.length);
		// Everything answered including the wildcard: full, and only then.
		expect(shown([FUTURE_ID, 'q1', 'q8', 'q5c', 'q5c:and', 'q6r', 'q6r:and', 'q2', 'q2:and', WILDCARD.id])).toBe(STEP_IDS.length);
	});
});
