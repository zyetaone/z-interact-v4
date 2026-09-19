/**
 * FUTURE / TONE PALETTE — TODO(content), owned by the futures-palette
 * workstream.
 *
 * The mood/era pre-step (ADR-036 §4.1: "a first screen where the table
 * chooses a future from a canonical, named palette"). Fixed interface:
 * `FUTURES` is an ordered list; each entry's `moodLine` feeds
 * `prompt.ts`'s `LayerInputs.mood`.
 */

export interface Future {
	key: string;
	name: string;
	/** Feeds prompt.ts's LayerInputs.mood. */
	moodLine: string;
}

// TODO(content): replace with the real named futures (Garden City, Broadacre
// City, Arcology, Solarpunk, Cyberpunk, Retrofuturism, Pragmatist retrofit —
// final list from the futures study, ADR-036 §4.1).
export const FUTURES: Future[] = [
	{ key: 'todo-future-1', name: 'TODO(content)', moodLine: 'TODO(content): mood/era line' }
];
