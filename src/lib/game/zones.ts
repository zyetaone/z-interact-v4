/**
 * FUNCTIONAL ZONES — one image per table per zone (zones-and-video.md §1,
 * futures.md §6). Fixed interface: `ZONES` is the list `finishTable`
 * iterates in `fal.ts`/`prompt.ts`, and each `key` is also the R2/D1 key
 * component (`r2.ts`'s `imageKey`).
 *
 * Re-derived for VERSION 4 of the questions (`game/questions.ts`): the
 * workstation (q4w) reaches the studio and the library, centaur deep work
 * (q5c) the library, the recharge biome (q6r) the garden, arrival (q3) the
 * plaza. Nature (q8) and technology (q7) reach every zone through the
 * table-level materials layer, and brilliant-at-one (q10) through the feel
 * layer — neither is zone-owned (`layers.ts`). Every zone below cites the
 * V4 question ids it actually reads.
 *
 * Two candidate sets, both implemented behind one export so the lead's call
 * (still pending) is a one-line change:
 *
 * - `book` (default): the content owner's own chapter framework — Library,
 *   Studio, Plaza, Garden (futures.md §6, p.202's "neural-state biomes").
 *   The content owner reviews slides and may expect their own book's frame
 *   reflected on stage.
 * - `questions`: zones derived directly from the question set
 *   (zones-and-video.md §1, set (b)) — every zone-worthy question attaches
 *   to exactly one zone, no answer orphaned.
 *
 * Type extension beyond the original stub (documented per the brief):
 * `ZoneRef` (owned by `server/prompt.ts`, off-limits to this workstream)
 * only carries `key`/`renderSuffix`. `Zone` extends it with `questionIds` —
 * the question ids that feed this zone's `renderSuffix` template — so a
 * consumer building `LayerInputs.programme` per zone knows which answers to
 * splice into the `{...}` placeholders below. `Zone[]` satisfies `ZoneRef[]`
 * structurally, so `answers.remote.ts`'s `for (const zone of ZONES)` needs
 * no change.
 */
import type { ZoneRef } from '$lib/server/prompt';

/**
 * The one on-screen name for a zone: sentence case from its key (`library`
 * -> `Library`). Every caption — phone gallery, alt text — reads this, so
 * no screen title-cases one tile and lower-cases the next.
 */
export function zoneLabel(key: string): string {
	return key ? key.charAt(0).toUpperCase() + key.slice(1).toLowerCase() : key;
}

export interface Zone extends ZoneRef {
	/** Question ids (from game/questions.ts) whose answers fill this zone's `{...}` placeholders. */
	questionIds: string[];
}

/**
 * The book's four functions (futures.md §6). `renderSuffix` fragments here are authored from
 * the chapter's own "engineered for" definitions — the source gives the zone names and their
 * question mapping, not literal prompt text. V4 mapping: library <- q5c + q4w (centaur deep
 * work, the workstation); studio <- q4w (the workstation, shared with the library — single-
 * select, so only the table's one pick renders in each); plaza <- q3 (arrival); garden <- q6r
 * (the recharge biome). A `{qN}` placeholder resolves to the question's fragment AND its
 * "And:" sub-question's fragment, when the table picked one (`layers.ts`'s `resolveZone`).
 */
/**
 * WHY EACH SUFFIX NAMES A ROOM AND A VIEWPOINT.
 *
 * With `REFERENCE_MODE` at its default `none` (`server/reference.ts`) a
 * table's four zones are four independent text-to-image renders. Nothing but
 * the words stops the model handing back the same room four times: the
 * table-level base — mood line, palette, materials, era — is identical
 * across the four prompts, and only this suffix differs.
 *
 * So each one states its own ROOM TYPE and its own CAMERA, and each says
 * "the same building" to carry the continuity the reference image used to
 * carry. The mood still matches the chosen lens picture, because the lens
 * mood line and the table's palette sit in every zone's base; what is no
 * longer shared is the FRAMING, which is precisely what made the anchored
 * run read as one picture edited four times.
 */
const BOOK_ZONES: Zone[] = [
	{
		key: 'library',
		questionIds: ['q5c', 'q4w'],
		renderSuffix:
			'a quiet deep-work floor in the same building, one wide view looking along its rooms: engineered for the hardest thinking, where deep work happens in a centaur organisation ({q5c}), and the workstation where one person and their AI sit ({q4w})'
	},
	{
		key: 'studio',
		questionIds: ['q4w'],
		renderSuffix:
			'a making and workshop floor in the same building, one wide view across the benches: engineered for creativity and teams making together, its workstations ({q4w})'
	},
	{
		key: 'plaza',
		questionIds: ['q3'],
		renderSuffix:
			'the arrival hall and social floor of the same building, one wide view from the entrance looking in: engineered for collaboration, and for arrival ({q3})'
	},
	{
		key: 'garden',
		questionIds: ['q6r'],
		renderSuffix:
			'the recharge landscape attached to the same building, one wide view from the path: engineered for restoration, where people recharge ({q6r})'
	}
];

/** Zones derived directly from the V4 question set — one zone-worthy question each, none orphaned. */
const QUESTION_ZONES: Zone[] = [
	{
		key: 'arrival',
		questionIds: ['q3'],
		renderSuffix: 'the entrance and circulation of the same building, one wide view from the door: {q3}'
	},
	{
		key: 'workstation',
		questionIds: ['q4w'],
		renderSuffix: 'the workstation floor of the same building, one wide view along the desks: {q4w}'
	},
	{
		key: 'deep-work',
		questionIds: ['q5c'],
		renderSuffix: 'the deep-work rooms of the same building, one wide view into the quietest of them: {q5c}'
	},
	{
		key: 'recharge',
		questionIds: ['q6r'],
		renderSuffix: 'the recharge landscape of the same building, one wide view from its edge: {q6r}'
	}
];

export const ZONE_SETS = {
	book: BOOK_ZONES,
	questions: QUESTION_ZONES
} as const;

/** Default set — the lead's call between `book`/`questions` is still pending. Switching is this one line. */
export const ZONES: Zone[] = ZONE_SETS.book;

// --- Shape guards ------------------------------------------------------------
for (const [name, zones] of Object.entries(ZONE_SETS)) {
	if (zones.length !== 4) {
		throw new Error(`ZONE_SETS.${name} must have exactly 4 zones, got ${zones.length}`);
	}
	if (new Set(zones.map((z) => z.key)).size !== zones.length) {
		throw new Error(`ZONE_SETS.${name} has duplicate zone keys`);
	}
}
