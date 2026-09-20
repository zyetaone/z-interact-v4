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

/** Two words, said twice: the recipe's 90–130-word budget cannot afford the old eleven. `no logos` is in the frame. */
export const NO_TEXT = 'no text';

/**
 * THE ANTI-BOARD TERMS. Evidenced, not guessed: the first real-credit
 * fidelity run came back with presentation BOARDS — a hero view plus a grid
 * of ten small panels — rather than one room. Fidelity to the answers was
 * high; the layout was unusable on a projector, and four zones each
 * containing ten panels is a mosaic of mosaics.
 *
 * The cause is that a prompt enumerating ten distinct programme items reads
 * to the model as a brief for a board. Two things push back: this negative,
 * and the per-zone programme cap in `layers.ts` that stops the enumeration
 * happening at all. Neither alone was enough.
 *
 * Lives here rather than in `futures.ts`'s `HOUSE_NEGATIVE` because it is a
 * rendering guard, the same family as `NO_TEXT` above, not content — and
 * `futures.ts` belongs to another workstream.
 */
export const NO_COLLAGE =
	'collage, grid, panels, storyboard, split screen, mosaic, contact sheet, multiple views, text, labels';

/**
 * The ceiling on the table-editable prompt. Screen 15's textarea is free
 * text that becomes the ENTIRE prompt sent to a paid third-party API and
 * then shown on a public screen, so it had to stop being unbounded. Long
 * enough for a real edit of the composed base (which runs a few hundred
 * characters), short enough that it cannot be used as a payload.
 */
export const MAX_COMPOSED_CHARS = 1200;

/**
 * What a table is allowed to put in the prompt: printable text, one line's
 * worth of whitespace, and no more than `MAX_COMPOSED_CHARS` of it.
 *
 * Control characters are stripped rather than rejected — a paste from a
 * document carries them invisibly, and refusing the paste would read to the
 * table as the app being broken. Truncation is on a word boundary where one
 * is near the cut, so the prompt ends as a phrase rather than mid-word.
 */
export function sanitizeComposed(raw: string, max: number = MAX_COMPOSED_CHARS): string {
	// eslint-disable-next-line no-control-regex -- stripping them is the point
	const stripped = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
	const collapsed = stripped.replace(/\s+/g, ' ').trim();
	if (collapsed.length <= max) return collapsed;
	const cut = collapsed.slice(0, max);
	const lastSpace = cut.lastIndexOf(' ');
	return (lastSpace > max - 80 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * The house negative, phrased as an instruction inside the prompt rather
 * than sent as an API field. fal's per-model schemas differ on whether a
 * `negative_prompt` parameter exists, and this app submits to `queue.fal.run`
 * over raw fetch with no schema introspection — an unrecognised field would
 * be silently ignored, which is the failure mode where the negative looks
 * applied and is not. In the prompt it always lands.
 */
export function negativeClause(negative: string | undefined): string {
	const terms = (negative ?? '').trim().replace(/[.\s]+$/, '');
	return terms ? `Avoid: ${terms}` : '';
}

/**
 * THE HOUSE BASE — the fixed opening frame every table's prompt starts
 * from, before any future's window is applied. A CINEMATIC frame, not
 * archviz (prompt-recipe.md §2, move 1): the question owner's references
 * are film stills — a lens, a time of day, atmosphere, a person in them —
 * and "photoreal architectural visualisation, no people in focus" is
 * exactly why every render looked like a developer's marketing image.
 * `year` is the only variable, supplied by the caller (layers.ts reads it
 * off the table's era chip) — this module stays content-free and does not
 * know what an "era" is.
 *
 * `layers.ts`'s `composeZonePrompt` recognises this sentence at the head of
 * a stored base (`FRAME_HEAD`) so the zone's moment can follow it directly.
 */
export const FRAME_HEAD = 'A film still, a workplace in';

export function houseBase(year: string): string {
	return `${FRAME_HEAD} ${year}: anamorphic 35 mm, shallow focus, volumetric light, haze, one viewpoint, no logos`;
}

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
	/** The zone's MOMENT — one subject, stated before the materials (prompt-recipe.md §2, move 2). Content-owned. */
	renderSuffix: string;
}

/**
 * Order per the recipe: frame (mood) → the zone's moment → materials →
 * programme → feel → wildcard → Avoid → guard. The moment sits right after
 * the frame so the model reads one subject before it reads any dressing.
 * `negative` rides in just before the closing NO_TEXT guard, so the
 * both-ends rule this module exists to hold (and `prompt.test.ts` asserts)
 * is unchanged, and the last thing the model reads is still the guard.
 */
export function composeLayers(inputs: LayerInputs, zone: ZoneRef, negative?: string): string {
	const fragments = [
		NO_TEXT,
		inputs.mood,
		zone.renderSuffix,
		inputs.materialsAndLight,
		inputs.programme,
		inputs.feel,
		...(inputs.wildcard ? [inputs.wildcard] : []),
		negativeClause(negative),
		NO_TEXT
	];
	return fragments.filter((f) => f && f.trim().length > 0).join('. ');
}
