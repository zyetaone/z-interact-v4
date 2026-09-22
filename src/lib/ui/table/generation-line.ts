/**
 * WHAT A TABLE READS WHILE IT WAITS, one line per generation state.
 *
 * This lived inside `DrawingScreen.svelte` as a loose `Record<string,
 * string>` and had drifted off the state machine: it named `submitted` and
 * `rendering`, neither of which `generate.ts` has ever produced, and it did
 * NOT name `requested` — the state a row is in from the moment fal accepts
 * it until the bytes come back, which is the whole of the wait.
 *
 * `LINE[state] ?? state` then fell through to the raw enum, so every table
 * watched the word REQUESTED in capitals for the longest part of the
 * evening. Found in the 21 Sep flow capture, in a screenshot taken for
 * something else entirely.
 *
 * Typed against `GenerationState` rather than `string`, so the next state
 * added to the machine fails the build here instead of reaching a phone.
 */
import type { GenerationState } from '$lib/server/generate';

/** `none` is not a machine state — it is the phone's own "no row yet". */
export type ShownState = GenerationState | 'none';

export const GENERATION_LINE: Record<ShownState, string> = {
	none: 'waiting',
	queued: 'in the queue',
	requested: 'drawing',
	stored: 'done',
	done: 'done',
	failed: 'failed — draw again'
};

/** Falls back to the raw value rather than throwing: an unknown state is a bug to see, not a blank cell. */
export function generationLine(state: string): string {
	return GENERATION_LINE[state as ShownState] ?? state;
}
