/**
 * FUNCTIONAL ZONES — one image per table per zone (zones-and-video.md §1,
 * futures.md §6). Fixed interface: `ZONES` is the list `finishTable`
 * iterates in `fal.ts`/`prompt.ts`, and each `key` is also the R2/D1 key
 * component (`r2.ts`'s `imageKey`).
 *
 * Two candidate sets, both implemented behind one export so the lead's call
 * (still pending) is a one-line change:
 *
 * - `book` (default): the content owner's own chapter framework — Library,
 *   Studio, Plaza, Garden (futures.md §6, p.202's "neural-state biomes").
 *   The content owner reviews slides and may expect their own book's frame
 *   reflected on stage.
 * - `questions`: zones derived directly from Q3-Q10 (zones-and-video.md §1,
 *   set (b), the design spike's own recommendation) — every one of the 8
 *   relevant questions attaches to exactly one zone, no answer orphaned.
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
 * below, in zones-and-video.md §1(b)).
 */
const BOOK_ZONES: Zone[] = [
	{
		key: 'library',
		questionIds: ['q5', 'q7'],
		renderSuffix:
			'wide establishing shot of the library: a space engineered for deep focus, features that protect attention ({q5}), technology kept {q7}'
	},
	{
		key: 'studio',
		questionIds: ['q6', 'q7'],
		renderSuffix:
			'wide establishing shot of the studio: a space engineered for creativity, furniture and gathering ({q6}), technology kept {q7}'
	},
	{
		key: 'plaza',
		questionIds: ['q3', 'q4', 'q6'],
		renderSuffix:
			'wide establishing shot of the plaza: a space engineered for collaboration, arrival ({q3}), movement ({q4}), meeting and gathering ({q6})'
	},
	{
		key: 'garden',
		questionIds: ['q8', 'q5'],
		renderSuffix:
			'wide establishing shot of the garden: a space engineered for restoration, nature ({q8}), a place for recovering after two hours of uninterrupted thought ({q5})'
	}
];

/** Zones derived directly from Q3-Q10 (zones-and-video.md §1, set (b)). Fragments ported verbatim. */
const QUESTION_ZONES: Zone[] = [
	{
		key: 'arrival',
		questionIds: ['q3', 'q4', 'q8'],
		renderSuffix: 'the entrance and circulation of a 2035 office: {q3}, wayfinding by {q4}, greenery: {q8}'
	},
	{
		key: 'focus',
		questionIds: ['q5'],
		renderSuffix: 'a space that protects attention: {q5}, for two hours of uninterrupted thought'
	},
	{
		key: 'meeting',
		questionIds: ['q6'],
		renderSuffix: 'a meeting or gathering space: {q6}'
	},
	{
		key: 'sensing',
		questionIds: ['q7', 'q9', 'q10'],
		renderSuffix: 'an environment where {q7}; the building {q9}; {q10} runs itself'
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
