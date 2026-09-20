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
 * WHY EACH MOMENT NAMES A WORK ACT, A VIEWPOINT AND PEOPLE MID-ACTION.
 *
 * Recipe v2 (20 Sep, after the first 20-table wall): rooms with one person
 * sitting read as 2026 offices with plants. So the moment is the ACT — the
 * human-and-AI arrangement the deep-work option describes, the workstation
 * doing what it does, the building responding to an arriving person, the
 * recharge in motion — with two or three people doing the thing, mid-action,
 * never posed. The option fragments (`questions.ts`) carry the act itself.
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
		moment: 'Deep work mid-act, no one posed: {q5c}'
	}),
	zone({
		key: 'studio',
		questionIds: ['q4w'],
		moment: 'Three people mid-task at their stations: {q4w}'
	}),
	zone({
		key: 'plaza',
		questionIds: ['q3'],
		moment: 'The arrival act, the building responding to the person arriving: {q3}'
	}),
	zone({
		key: 'garden',
		questionIds: ['q6r'],
		moment: 'The recharge act, mid-motion, no one posed: {q6r}'
	})
];

/** Zones derived directly from the V4 question set — one zone-worthy question each, none orphaned. */
const QUESTION_ZONES: Zone[] = [
	zone({ key: 'arrival', questionIds: ['q3'], moment: 'The arrival act from the door, the building responding to the visitor: {q3}' }),
	zone({ key: 'workstation', questionIds: ['q4w'], moment: 'One station from the aisle, its occupant mid-task: {q4w}' }),
	zone({ key: 'deep-work', questionIds: ['q5c'], moment: 'Deep work mid-act in the quietest room: {q5c}' }),
	zone({ key: 'recharge', questionIds: ['q6r'], moment: 'The recharge act at the landscape\'s edge, people mid-motion: {q6r}' })
];

/**
 * ONE IMPOSSIBLE IDEA PER FRAME (recipe v2, from the one-table loop and the
 * owner's garden-office video — planters floating untethered, a glass wall
 * that is an aquarium, blossom drifting indoors). Two per lens; a table's
 * seed picks one so its four zones share it (`layers.ts` composes it into
 * the base). Full clauses with verbs, never noun lists.
 */
export const IMPOSSIBLE_IDEAS: Record<string, readonly [string, string]> = {
	'garden-city': ['a stream runs under the glass floor, fish passing beneath their feet', 'trees grow up through the desks, their canopy indoors'],
	arcology: ['a waterfall drops the full height of the void beside them', 'gardens hang from the bridges, roots trailing in mid-air'],
	solarpunk: ['planters float untethered overhead, roots trailing in the air', 'blossom drifts indoors through the shafts of light'],
	'neo-seoul': ['one glass wall is an aquarium, fish crossing the signage', 'holographic koi swim through the air between the desks'],
	'broadacre-city': ['the glass wall dissolves into open grassland as someone walks through it', 'a flock of drones settles in the field like birds'],
	retrofuturism: ['brass instruments project living charts into the air', 'a bakelite dial opens the window onto the sea']
};

/** The impossible idea a table carries in all four zones — seeded by table number so a room never mixes two. */
export function impossibleIdea(futureKey: string | null | undefined, table: number | null | undefined): string | undefined {
	const pair = futureKey ? IMPOSSIBLE_IDEAS[futureKey] : undefined;
	return pair ? pair[Math.abs(table ?? 0) % 2] : undefined;
}

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
