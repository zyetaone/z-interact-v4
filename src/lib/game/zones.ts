/**
 * FUNCTIONAL ZONES — one image per table per zone (zones-and-video.md §1,
 * futures.md §6). Fixed interface: `ZONES` is the list `finishTable`
 * iterates in `fal.ts`/`prompt.ts`, and each `key` is also the R2/D1 key
 * component (`r2.ts`'s `imageKey`).
 *
 * Re-derived for VERSION 3 of the questions (`game/questions.ts`): Q4
 * (hardest thinking) and Q9 (centaurs) are new; Q7 absorbed the old
 * sensing content that used to live on Q9; Q3 now covers both arrival and
 * wayfinding. Every zone below cites the V3 question ids it actually reads.
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

export interface Zone extends ZoneRef {
	/** Question ids (from game/questions.ts) whose answers fill this zone's `{...}` placeholders. */
	questionIds: string[];
}

/**
 * The book's four functions (futures.md §6). `renderSuffix` fragments here are authored from
 * the chapter's own "engineered for" definitions — the source gives the zone names and their
 * question mapping, not literal prompt text (that's only worked out for the `questions` set
 * below, in zones-and-video.md §1(b)). V3 mapping: library <- q4+q5 (hardest thinking, what
 * else restores); studio <- q6+q7+q9 (furniture, tech, centaurs); plaza <- q3+q10 (arrival,
 * agility); garden <- q8+q5 (nature, restoration — q5 shared with library, single-select so
 * only the table's one pick renders in each).
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
		questionIds: ['q4', 'q5'],
		renderSuffix:
			'a quiet reading room in the same building, one wide view looking along the shelves: engineered for the hardest thinking ({q4}), with what protects and restores attention afterward ({q5})'
	},
	{
		key: 'studio',
		questionIds: ['q6', 'q7', 'q9'],
		renderSuffix:
			'a making and workshop floor in the same building, one wide view across the benches: engineered for creativity, furniture and gathering ({q6}), technology that is {q7}, and the bench where humans and AI work together ({q9})'
	},
	{
		key: 'plaza',
		questionIds: ['q3', 'q10'],
		renderSuffix:
			'the arrival hall and social floor of the same building, one wide view from the entrance looking in: engineered for collaboration, arrival ({q3}), and the agility of the workplace itself ({q10})'
	},
	{
		key: 'garden',
		questionIds: ['q8', 'q5'],
		renderSuffix:
			'an outdoor garden court or glasshouse attached to the same building, one wide view from the path: engineered for restoration, nature ({q8}), a place for recovering and protecting attention ({q5})'
	}
];

/** Zones derived directly from the V3 question set (zones-and-video.md §1, set (b)). */
const QUESTION_ZONES: Zone[] = [
	{
		key: 'arrival',
		questionIds: ['q3', 'q8'],
		renderSuffix: 'the entrance and circulation of the office: {q3}, greenery: {q8}'
	},
	{
		key: 'focus',
		questionIds: ['q4', 'q5'],
		renderSuffix: 'a space that protects and restores attention: {q4}, {q5}'
	},
	{
		key: 'meeting',
		questionIds: ['q6', 'q9'],
		renderSuffix: 'a meeting or gathering space, including where the centaurs work: {q6}; {q9}'
	},
	{
		key: 'agile',
		questionIds: ['q7', 'q10'],
		renderSuffix: 'an environment where the technology is {q7}, and the workplace shows its agility as {q10}'
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
