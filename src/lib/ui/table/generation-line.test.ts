/**
 * Every state the machine can reach must have words for it. The map this
 * replaces had drifted: two invented states, and `requested` — the whole of
 * the wait — missing, so the phone printed the raw enum.
 */
import { describe, expect, it } from 'vitest';
import { GENERATION_LINE, generationLine, type ShownState } from './generation-line';
import type { GenerationState } from '$lib/server/generate';

const ALL: GenerationState[] = ['queued', 'requested', 'stored', 'done', 'failed'];

describe('generationLine', () => {
	it('has a line for every state the machine produces', () => {
		// Not "the line differs from the state name": `done` maps to the word
		// "done" and always should. The exhaustiveness is held by the typed
		// Record at build time; this is the runtime half of it.
		for (const state of ALL) expect(GENERATION_LINE[state], state).toBeTruthy();
	});

	it('names the state a row spends the whole render in', () => {
		// The one that was missing. If this ever reads "requested" again, a
		// table is reading an enum.
		expect(generationLine('requested')).toBe('drawing');
	});

	it('invents no state the machine cannot produce', () => {
		const allowed = new Set<ShownState>([...ALL, 'none']);
		for (const key of Object.keys(GENERATION_LINE)) {
			expect(allowed.has(key as ShownState), `${key} is not a real state`).toBe(true);
		}
	});

	it('shows an unknown state rather than a blank cell', () => {
		expect(generationLine('something-new')).toBe('something-new');
	});
});
