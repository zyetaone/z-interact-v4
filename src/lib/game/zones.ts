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
const ZONE_LABELS: Record<string, string> = {
	// The hero is not a room in the building, so sentence-casing its key
	// ("Workspace") reads as a fifth zone. It is the whole thing.
	workspace: 'Your workspace'
};

export function zoneLabel(key: string): string {
	if (ZONE_LABELS[key]) return ZONE_LABELS[key];
	return key ? key.charAt(0).toUpperCase() + key.slice(1).toLowerCase() : key;
}

export interface Zone extends ZoneRef {
	/** Question ids (from game/questions.ts) whose answers fill this zone's `{...}` placeholders. */
	questionIds: string[];
	/**
	 * THE ONE MAIN IMAGE, not a fifth room. A hero zone's prompt is built by
	 * `routes/t/[table]/hero.ts`'s `composeHeroPrompt`, not by
	 * `composeZonePrompt` — it asks for the whole workplace in one elevated
	 * three-quarter view rather than one room, one camera, one act. Its
	 * `moment` below is therefore documentation of the frame, not a template
	 * anything splices answers into.
	 */
	hero?: boolean;
	/** The zone's MOMENT (prompt-recipe.md §2, move 2): one subject, one viewpoint, one person
	 *  doing something, with a `{qN}` slot for the answer that owns the zone. `renderSuffix` is
	 *  this same string — `ZoneRef`'s name for it, kept so `server/prompt.ts` stays content-free. */
	moment: string;
}

/** A zone whose `renderSuffix` is its `moment` — one string, two names. */
function zone(z: { key: string; questionIds: string[]; moment: string; hero?: boolean }): Zone {
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
/**
 * TWO ZONES, NOT FOUR, SINCE THE CUT TO FIVE QUESTIONS.
 *
 * A zone's `moment` names ONE ACT and splices that zone's own question into
 * it. The 21 Sep minutes cut both remaining act questions' neighbours — q3
 * (arrival, the plaza's) and q4w (the workstation, the studio's) — leaving
 * only deep work and recharge as things a person can be seen DOING.
 *
 * Repointing the two orphaned zones at q2 (materials) and q8 (outdoors) was
 * tried and is wrong: those are qualities, not acts, and their fragments
 * carry commas and semicolons, which the moment machinery splits on. The
 * plaza came out as "its surfaces reading plainly: grey." Fewer questions
 * means fewer scenes; `studio` and `plaza` are retired below so their
 * existing rows still resolve.
 */
/** The questions a person can be seen DOING — one zone each. */
const ACT_QUESTION_IDS = ['q5c', 'q6r'] as const;

const BOOK_ZONES: Zone[] = [
	zone({
		key: 'library',
		questionIds: ['q5c'],
		moment: 'Deep work mid-act, no one posed: {q5c}'
	}),
	zone({
		key: 'garden',
		questionIds: ['q6r'],
		moment: 'The recharge act, mid-motion, no one posed: {q6r}'
	})
];

/** Zones derived directly from the V4 question set — one zone-worthy question each, none orphaned. */
const QUESTION_ZONES: Zone[] = [
	zone({ key: 'deep-work', questionIds: ['q5c'], moment: 'Deep work mid-act in the quietest room: {q5c}' }),
	zone({ key: 'recharge', questionIds: ['q6r'], moment: 'The recharge act at the landscape\'s edge, people mid-motion: {q6r}' })
];

/**
 * ONE IMPOSSIBLE IDEA PER FRAME (recipe v2, from the one-table loop and the
 * owner's garden-office video — planters floating untethered, a glass wall
 * that is an aquarium, blossom drifting indoors). A table's seed picks one
 * so its four zones share it (`layers.ts` composes it into the base). Full
 * clauses with verbs, never noun lists.
 *
 * FIVE PER LENS, not two, since 20 Sep. With one image per table the judge
 * has to be able to tell two tables apart, and two ideas meant every
 * odd-numbered table on a lens got the same one — tables 3 and 7 on
 * solarpunk composed character-for-character identical prompts when their
 * answers matched. Five does not make twenty tables unique on its own
 * (see `VANTAGES`, which does); it makes a collision rare instead of
 * routine.
 *
 * The three added per lens are this repo's words, in the register of the
 * first two, and have NOT been through the question owner. They are the
 * first thing to replace if the voice is wrong.
 */
export const IMPOSSIBLE_IDEAS: Record<string, readonly string[]> = {
	'garden-city': [
		'a stream runs under the glass floor, fish passing beneath their feet',
		'trees grow up through the desks, their canopy indoors',
		'a hedge wall opens itself where someone walks toward it',
		'the ceiling is a meadow seen from below, grass against the glass',
		'beehives hang in the stairwell, the bees moving between floors'
	],
	arcology: [
		'a waterfall drops the full height of the void beside them',
		'gardens hang from the bridges, roots trailing in mid-air',
		'a lift car climbs the outside of the void with no shaft around it',
		'terraces step down the void, each one a different weather',
		'cable bridges thread the void, carrying people between terraces'
	],
	solarpunk: [
		'planters float untethered overhead, roots trailing in the air',
		'blossom drifts indoors through the shafts of light',
		'the roof panels turn slowly to follow the light, like leaves',
		'a wall of moss breathes, brightening where people gather',
		'vines carry the power, glowing faintly along their length'
	],
	'neo-seoul': [
		'one glass wall is an aquarium, fish crossing the signage',
		'holographic koi swim through the air between the desks',
		'rain falls upward past the window, lit from below',
		'a second city hangs mirrored above the ceiling line',
		'the floor is a map of the city, moving under their feet'
	],
	'broadacre-city': [
		'the glass wall dissolves into open grassland as someone walks through it',
		'a flock of drones settles in the field like birds',
		'a room detaches and drifts to the next field, still occupied',
		'the horizon is visible through the building, wall to wall',
		'a dirt track runs straight through the floor plate and out again'
	],
	retrofuturism: [
		'brass instruments project living charts into the air',
		'a bakelite dial opens the window onto the sea',
		'pneumatic tubes carry drawings overhead between the desks',
		'a clockwork orrery turns slowly through the full height of the room',
		'the walls unfold like a cabinet, revealing the room behind'
	]
};

/** The impossible idea a table carries in all of its renders — seeded by table number so a room never mixes two. */
export function impossibleIdea(futureKey: string | null | undefined, table: number | null | undefined): string | undefined {
	const pool = futureKey ? IMPOSSIBLE_IDEAS[futureKey] : undefined;
	if (!pool || pool.length === 0) return undefined;
	// `table - 1` so table 1 takes the first idea and consecutive tables walk
	// the pool in order; `% pool.length` over the old `% 2`, which handed
	// every odd table on a lens the same clause.
	return pool[Math.abs((table ?? 1) - 1) % pool.length];
}

/* -------------------------------------------------------------------------- */
/* WHERE THE CAMERA STANDS — one per table, never repeated in a room          */
/* -------------------------------------------------------------------------- */

/**
 * THE JUDGE HAS TO BE ABLE TO TELL TWO TABLES APART.
 *
 * With four zones per table, two tables that answered identically still
 * produced eight different pictures and nobody compared them directly. With
 * ONE image per table they produce one picture each, and two tables with the
 * same lens and the same answers composed the same prompt to the character —
 * so the wall showed the same building twice and there was nothing to judge.
 *
 * The vantage is the fix that does not touch a single answer: every table
 * looks at its own building from somewhere else. It stays an ELEVATED
 * THREE-QUARTER view in every case — that is the frame the brief fixed, and
 * varying it into plans and street views would be varying the format rather
 * than the design — but the corner, the height and what is in the near
 * foreground move.
 *
 * There are as many vantages as the room has tables, so within one room no
 * two tables share one. That is the hard guarantee; the impossible idea
 * above is the softer one (five per lens against twenty tables, so a
 * collision is possible and the vantage is what separates that pair).
 */
export const VANTAGES: readonly string[] = [
	'from the north-west corner, two floors up',
	'from a footbridge crossing the main volume',
	'from the top of the entrance stair, looking back in',
	'from a gallery balcony on the far side',
	'from above the atrium, near the roof glazing',
	'from the corner of an upper terrace, planting in the near foreground',
	'from a mezzanine over the busiest floor',
	'from the head of a light well, looking down its length',
	'from an upper landing where two wings meet',
	'from outside the glass, high, looking in through it',
	'from the quiet end, the length of the building running away',
	'from a stair half-landing, the handrail in the near foreground',
	'from the roof edge, looking back across the roofscape',
	'from a bridge between two blocks, both visible',
	'from over the entrance, the approach below and the floors beyond',
	'from a high corner window, the building folding around it',
	'from the top of the void, the floors stacked below',
	'from an upper walkway on the shaded side',
	'from the gallery above the arrival hall',
	'from the highest floor, looking down through the section'
];

/**
 * This table's vantage. Seeded by table number alone — not by lens, not by
 * answers — so it is stable across a redraw and a reset (the table gets the
 * same viewpoint every time, which is what makes a redraw read as the same
 * building drawn again) and unique within a room of `VANTAGES.length`.
 */
export function vantageFor(table: number | null | undefined): string {
	return VANTAGES[Math.abs((table ?? 1) - 1) % VANTAGES.length];
}

/**
 * THE HERO — one main workspace design per table (owner decision, 20 Sep):
 * four pictures per table read as four unrelated ideas, one picture reads
 * as the table's answer. The four zones stay in the code and are off by
 * default; Phase 2's `ZONE_SET` decides which of the three sets renders.
 *
 * Its `questionIds` name every zone-worthy question because the hero frame
 * carries all four acts at once — which is also what keeps `ZONE_OWNED_IDS`
 * honest if a hero-only run ever composes a table-level base.
 */
export const HERO_ZONE: Zone = zone({
	key: 'workspace',
	questionIds: ['q3', 'q4w', 'q5c', 'q6r'],
	hero: true,
	moment: 'The whole workspace in one elevated three-quarter view, one continuous building, people small and mid-task'
});

export const HERO_ZONES: Zone[] = [HERO_ZONE];

export const ZONE_SETS = {
	book: BOOK_ZONES,
	questions: QUESTION_ZONES
} as const;

/** Default set — the lead's call between `book`/`questions` is still pending. Switching is this one line. */
export const ZONES: Zone[] = ZONE_SETS.book;


/* -------------------------------------------------------------------------- */
/* WHICH ZONES RENDER — `ZONE_SET`                                            */
/* -------------------------------------------------------------------------- */

/**
 * `hero` (the default) renders the one main workspace image per table;
 * `four` renders the four functional zones; `all` renders five.
 *
 * The default is the owner's decision of 20 Sep: four pictures per table
 * read as four unrelated ideas, one picture reads as the table's answer.
 * The four zones are not deleted — a room that wants them is one variable
 * away — and `all` exists for a rehearsal that wants to compare the two
 * side by side, not for the night.
 *
 * An unrecognised value falls back to `hero` rather than to "everything",
 * on the same rule `FAL_RESOLUTION` and `REFERENCE_MODE` already follow: a
 * typo must not quintuple what a room spends.
 */
export type ZoneSetName = 'hero' | 'four' | 'all';

export function zoneSetFrom(raw: string | undefined): ZoneSetName {
	return raw === 'four' || raw === 'all' ? raw : 'hero';
}

/** The zones a render/read path should enumerate, given the raw `ZONE_SET` value. */
export function activeZones(raw: string | undefined): Zone[] {
	switch (zoneSetFrom(raw)) {
		case 'four':
			return [...ZONES];
		case 'all':
			return [...HERO_ZONES, ...ZONES];
		default:
			return [...HERO_ZONES];
	}
}

/**
 * EVERY zone this app has ever rendered, whatever `ZONE_SET` says today.
 *
 * A row in D1 outlives the variable that queued it: a table rendered under
 * `four` and then read under `hero` still has four `image` rows, and a
 * lookup restricted to the active set would fail to find the zone
 * definition for a row that plainly exists — which is how a retry or a
 * ticker silently stops advancing a row. Lookups use this; enumeration
 * (what to queue, what to show) uses `activeZones`.
 */
/**
 * Zones that no set queues any more, kept so their ROWS still resolve. The
 * cut to five questions (21 Sep minutes) took q3 and q4w with it, and the
 * two zones that asked them — `arrival` and `workstation` — left the
 * question set with them. Any table rendered before that still has image
 * rows whose `zone_key` says `arrival`, and a ticker that cannot find the
 * definition silently stops advancing the row. Their `questionIds` are
 * emptied rather than repointed: the question they showed is gone, and
 * claiming they show a different one would put the wrong subject in a
 * regenerated prompt.
 */
const RETIRED_ZONES: Zone[] = [
	zone({ key: 'arrival', questionIds: [], moment: 'The arrival act from the door, the building responding to the visitor' }),
	zone({ key: 'workstation', questionIds: [], moment: 'One station from the aisle, its occupant mid-task' }),
	zone({ key: 'studio', questionIds: [], moment: 'Three people mid-task at their stations' }),
	zone({ key: 'plaza', questionIds: [], moment: 'The social floor at its busiest' })
];

const ALL_KNOWN_ZONES: Zone[] = [...HERO_ZONES, ...ZONE_SETS.book, ...ZONE_SETS.questions, ...RETIRED_ZONES];

export function zoneByKey(key: string): Zone | undefined {
	return ALL_KNOWN_ZONES.find((z) => z.key === key);
}

/** True when this key is the one main workspace image — its prompt is composed differently (`hero.ts`). */
export function isHeroZone(key: string): boolean {
	return zoneByKey(key)?.hero === true;
}

// --- Shape guards ------------------------------------------------------------
// The multi-zone sets only: `HERO_ZONES` is deliberately one zone, and its
// guard is below.
//
// The count was 4 and is now "one per act question". The 21 Sep minutes cut
// arrival and the workstation, so there are two acts left to draw; a guard
// insisting on four would only be satisfied by inventing two scenes with no
// question behind them, which is exactly what this guard exists to prevent.
for (const [name, zones] of Object.entries(ZONE_SETS)) {
	if (zones.length !== ACT_QUESTION_IDS.length) {
		throw new Error(`ZONE_SETS.${name} must have one zone per act question (${ACT_QUESTION_IDS.length}), got ${zones.length}`);
	}
	if (new Set(zones.map((z) => z.key)).size !== zones.length) {
		throw new Error(`ZONE_SETS.${name} has duplicate zone keys`);
	}
}

if (!HERO_ZONE.hero) {
	throw new Error('HERO_ZONE must be flagged hero: true — composeHeroPrompt is chosen by that flag');
}
if (ZONE_SETS.book.some((z) => z.key === HERO_ZONE.key) || ZONE_SETS.questions.some((z) => z.key === HERO_ZONE.key)) {
	throw new Error('HERO_ZONE.key collides with a four-zone set key — the R2 key and the D1 zone_key are the same string');
}
