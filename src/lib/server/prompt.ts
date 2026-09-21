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
 * happening at all. Neither alone was enough. Cut from ten terms to five
 * for recipe v2's word budget (panels / storyboard / mosaic / contact sheet
 * are synonyms of collage and grid; `text` is the NO_TEXT guard).
 *
 * Lives here rather than in `futures.ts`'s `HOUSE_NEGATIVE` because it is a
 * rendering guard, the same family as `NO_TEXT` above, not content — and
 * `futures.ts` belongs to another workstream.
 */
export const NO_COLLAGE = 'collage, grid, split screen, labels';

/**
 * The ceiling on the table-editable prompt. Screen 15's textarea is free
 * text that becomes the ENTIRE prompt sent to a paid third-party API and
 * then shown on a public screen, so it had to stop being unbounded. Long
 * enough for a real edit of the composed base, short enough that it cannot
 * be used as a payload.
 *
 * It was 1,200, and "a few hundred characters" was wrong about the base: a
 * fully answered table already composed to ~1,150 and sat fifty characters
 * from being silently cut. Adding the exposure clause (~112 characters,
 * said from both sides) pushed all four zones past it, and what
 * `sanitizeComposed` drops off the end is the Avoid list and the closing
 * no-text guard — the two things the composition exists to guarantee.
 * Measured before raising it: 1,116-1,153 without the clause, 1,228-1,265
 * with. 1,500 restores the headroom the original number was assumed to
 * have; bounded is still bounded, and a payload is no more possible at
 * 1,500 than at 1,200.
 */
/**
 * THE HOUSE HALF OF THE PROMPT, IN THE MODEL'S OWN SYSTEM FIELD.
 *
 * nano-banana-2 documents a `system_prompt` input (fal.ts's note lists the
 * schema, checked 19 Sep). Until now every house rule — no text, the Avoid
 * list, the exposure, the single-frame instruction, the camera — rode
 * inside the per-table prompt, where it competes with the table's own
 * answers for the model's attention and for the 1,500-character budget.
 * Generation 1 had no such field and put everything in one string, which is
 * where that shape came from; this is that generation's constant tail
 * (camera, lighting, style, composition, the no-text guard) lifted into the
 * field that exists for it.
 *
 * ADDITIVE ON PURPOSE, AND THIS IS THE WHOLE DESIGN OF THE CHANGE.
 *
 * The composed prompt still says all of this itself. Nothing was removed
 * from it. The failure mode fal.ts warns about two screens up is that an
 * unrecognised field is accepted with a 200 and silently dropped — and if
 * this app had moved the house rules OUT of the prompt in the same change
 * that moved them IN to `system_prompt`, a silently-dropped field would
 * mean every render losing the no-text guard and the Avoid list at once,
 * with a 200 on every submit and nothing to read as a failure. Days before
 * an event that is not a trade worth making for some characters back.
 *
 * So: say it twice, confirm from a real render that the field lands, and
 * only then delete the duplication and reclaim the budget. The prompt
 * already says NO_TEXT at both ends by the same reasoning — a house rule
 * repeated is a house rule reinforced, not a bug.
 */
export const HOUSE_SYSTEM =
	'You are an architectural visualiser. Every image you return is one photorealistic architectural photograph of one continuous space. ' +
	'Hyperrealistic architectural photography; wide-angle 24mm lens holding the full spatial context; natural daylight with subtle artificial accents; ' +
	'balanced exposure holding both the bright areas and the shadows open; premium architectural-digest quality; sharp focus throughout, with shallow depth of field only for atmosphere; ' +
	'composed on the thirds, with strong leading lines drawing the eye through the space. ' +
	'Never panels, insets, collage, grid or a divided frame. ' +
	'Never text, signage, labels, captions, watermarks, logos or UI of any kind. ' +
	'Never posed faces or portraits: people read small, anonymous and mid-task. ' +
	'Emphasise materiality, spatial flow, and the interplay of light and form.';

/**
 * `SYSTEM_PROMPT` — the revert. Anything but `off` sends `HOUSE_SYSTEM`;
 * `off` sends no system field at all and the app behaves exactly as it did
 * before this landed, which is what the desk needs on the night if the
 * renders turn out worse rather than better.
 */
export function systemPromptFrom(raw: string | undefined): string | undefined {
	return raw?.trim().toLowerCase() === 'off' ? undefined : HOUSE_SYSTEM;
}

export const MAX_COMPOSED_CHARS = 1500;

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
export const FRAME_HEAD = 'A film still, a';

/**
 * THE ROOM CAME BACK DARK.
 *
 * Every lens contributes surfaces rather than light — neo-seoul's "dark
 * surfaces", the house window's "moody rather than stark, pooled light,
 * shadow held deliberately" — and the model reads a stack of those as a
 * night interior. The frame already says "volumetric daylight"; on its own
 * that lost to the rest of the prompt. This says it as an EXPOSURE, which
 * is the word a model reads as a camera setting rather than as weather.
 */
export const EXPOSURE = 'bright overall exposure, daylight filling the volume, open shadows';

/**
 * The same instruction as a negative. Measured on one table with identical
 * answers: the positive clause alone moved mean luminance 108 -> 117 on a
 * 0-255 scale, and the frame still sat in shade; saying it from both sides
 * is what made the glasshouse read as daylit. It deliberately does NOT say
 * "night": a lens has to hold its identity at any hour, and the day-neutral
 * guard in the tests forbids the word anywhere in a hero prompt, Avoid list
 * included. Suppressed together with EXPOSURE, since a table that asked for
 * the dark asked for gloom too.
 */
export const UNDEREXPOSED_NEGATIVE = 'underexposed, murky, crushed blacks, gloom';

/**
 * The knob that lets a feel word opt out of the brightening, and why it is
 * empty.
 *
 * It was `['quiet', 'focused', 'sacred']`, on the reasoning that a table
 * which asked for the dark should keep it. Measuring the two branches on
 * production showed what that cost: a suppressed frame sat at mean
 * luminance 80 with 27% of it below 40, against 113 and 11% for a brightened
 * one, and `focused` is a common enough pick to put a real share of the wall
 * in the first group. The owner's complaint was about the wall as a whole.
 *
 * The better fix was upstream. Those three fragments (`questions.ts` q11)
 * used to describe how little light there was; they now describe WHERE the
 * light is — a bright pool on the work, a shaft into a light-filled room, a
 * soft and unhurried foreground. A table's choice still shapes the light. It
 * no longer dims the building, so there is nothing left to suppress.
 *
 * Kept as a knob rather than deleted: if the dress run shows a lens that
 * needs its dark back, putting its key here restores the old behaviour with
 * no other change.
 */
export const DARK_FEEL_KEYS: readonly string[] = [];

/**
 * True when nothing the table chose asks for night or deep shadow.
 *
 * `dark` is a parameter only so a test can prove the knob still works while
 * `DARK_FEEL_KEYS` is empty; every caller uses the default.
 */
export function wantsBrightExposure(
	feelKeys: readonly string[],
	dark: readonly string[] = DARK_FEEL_KEYS
): boolean {
	return !feelKeys.some((k) => dark.includes(k));
}

/**
 * The house frame every ZONE render opens with.
 *
 * `bright` defaults to true: a zone prompt says the exposure the same way a
 * hero prompt does, because a wall of four dark tiles per table is the thing
 * that was actually complained about. Pass false to get the old frame back
 * for one render without touching anything else.
 */
export function houseBase(year: string, bright = true): string {
	const exposure = bright ? `, ${EXPOSURE}` : '';
	return `${FRAME_HEAD} ${year} workplace: anamorphic 35 mm, volumetric light${exposure}, no logos`;
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
