/**
 * FUNCTIONAL ZONES — one image per table per zone (zones-and-video.md §1,
 * futures.md §6). Fixed interface: `ZONES` is the list `finishTable`
 * iterates in `fal.ts`/`prompt.ts`, and each `key` is also the R2/D1 key
 * component (`r2.ts`'s `imageKey`).
 *
 * Re-derived for VERSION 4 of the questions (`game/questions.ts`): the
 * workstation (q4w) reaches the studio, centaur deep work
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
	/** The zone's MOMENT (prompt-recipe.md §2, move 2): one subject, one viewpoint, one person
	 *  doing something, with a `{qN}` slot for the answer that owns the zone. `renderSuffix` is
	 *  this same string — `ZoneRef`'s name for it, kept so `server/prompt.ts` stays content-free. */
	moment: string;
}

/** A zone whose `renderSuffix` is its `moment` — one string, two names. */
function zone(z: { key: string; questionIds: string[]; moment: string }): Zone {
	return { ...z, renderSuffix: z.moment };
}

/**
 * The book's four functions (futures.md §6). `renderSuffix` fragments here are authored from
 * the chapter's own "engineered for" definitions — the source gives the zone names and their
 * question mapping, not literal prompt text. V4 mapping, one slot per zone (prompt-recipe.md
 * §4): library <- q5c (centaur deep work); studio <- q4w (the workstation); plaza <- q3
 * (arrival); garden <- q6r (the recharge biome). A `{qN}` placeholder resolves to the question's fragment AND its
 * "And:" sub-question's fragment, when the table picked one (`layers.ts`'s `resolveZone`).
 */
/**
 * WHY EACH MOMENT NAMES A ROOM, A VIEWPOINT AND A PERSON.
 *
 * With `REFERENCE_MODE` at its default `none` (`server/reference.ts`) a
 * table's four zones are four independent text-to-image renders. Nothing but
 * the words stops the model handing back the same room four times: the
 * table-level base — window, materials, feel — is identical across the four
 * prompts, and only this moment differs. So each one states its own ROOM,
 * its own CAMERA and one small anonymous figure doing something (the
 * owner's references all have one), and the shared world through the
 * window carries the continuity across the set.
 */
const BOOK_ZONES: Zone[] = [
	zone({
		key: 'library',
		questionIds: ['q5c'],
		moment: 'A deep-work room from the doorway, one person in a shaft of light: {q5c}'
	}),
	zone({
		key: 'studio',
		questionIds: ['q4w'],
		moment: 'A making floor across long benches, two people mid-task, dust in the light; at each bench, {q4w}'
	}),
	zone({
		key: 'plaza',
		questionIds: ['q3'],
		moment: 'The arrival hall from the entrance, a visitor at the threshold: {q3}'
	}),
	zone({
		key: 'garden',
		questionIds: ['q6r'],
		moment: 'A garden court from the path, one person walking slowly: {q6r}'
	})
];

/** Zones derived directly from the V4 question set — one zone-worthy question each, none orphaned. */
const QUESTION_ZONES: Zone[] = [
	zone({ key: 'arrival', questionIds: ['q3'], moment: 'The entrance from the door, one visitor mid-step: {q3}' }),
	zone({ key: 'workstation', questionIds: ['q4w'], moment: 'One desk seen from the aisle, its occupant at work: {q4w}' }),
	zone({ key: 'deep-work', questionIds: ['q5c'], moment: 'The quietest room from its doorway, one person still: {q5c}' }),
	zone({ key: 'recharge', questionIds: ['q6r'], moment: 'The recharge landscape from its edge, one person walking: {q6r}' })
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
