/**
 * PROMPT COMPOSITION — pure, no I/O, content-free.
 *
 * Four layers per ADR-036 §3 / architecture doc §6: mood/era → materials &
 * light → programme (the 11 questions) → feel. The wildcard, if present, is
 * appended verbatim after the four layers. A `NO_TEXT` guard fragment is
 * placed first AND last (image models bias toward rendering text/UI chrome
 * when a prompt doesn't push back on it, and pushing back once is not
 * enough — this is `prompt.test.ts`'s exact assertion).
 *
 * TODO(content): the *wording* of each layer and which question answers
 * feed which layer are owned by the futures-palette / game-flow content
 * workstreams. This module only fixes the ORDER and the typed shape; it
 * does not know what a "future" or a "zone" is beyond a string key.
 */

export const NO_TEXT = 'no text, no labels, no UI chrome, no watermark';

export interface LayerInputs {
	/** e.g. the chosen future's mood/era line. TODO(content): sourced from game/futures.ts. */
	mood: string;
	/** Materials & light description. TODO(content): derived from Q1/Q2-class answers. */
	materialsAndLight: string;
	/** The bulk of the programme — TODO(content): composed from Q3-Q10 answers, per zone. */
	programme: string;
	/** The closing feel line. TODO(content): derived from Q11. */
	feel: string;
	/** Optional free-text wildcard, appended verbatim, untouched by this function. */
	wildcard?: string;
}

/** Which functional zone this render is for. Content-owned; this module treats it as an opaque label. */
export interface ZoneRef {
	key: string;
	/** Short render-suffix hint, e.g. "wide establishing shot of the {zone} area". TODO(content). */
	renderSuffix: string;
}

export function composeLayers(inputs: LayerInputs, zone: ZoneRef): string {
	const fragments = [
		NO_TEXT,
		inputs.mood,
		inputs.materialsAndLight,
		inputs.programme,
		inputs.feel,
		zone.renderSuffix,
		...(inputs.wildcard ? [inputs.wildcard] : []),
		NO_TEXT
	];
	return fragments.filter((f) => f && f.trim().length > 0).join('. ');
}
