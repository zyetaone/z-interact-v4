/**
 * FIXTURES — 20 fake tables in mixed states, behind `?fixtures=1`, so the
 * three beats and the per-table sequence render with no D1/R2 at all. Tile
 * "images" are the table's own lens still (`LENS_IMAGE`, served from
 * `static/visuals/`) — a real photograph in every tile, so the crossfade,
 * grid layout and backdrops are exercised with no render pipeline and no
 * network beyond the app's own static assets.
 *
 * Mirrors `gallery.remote.ts`'s `ProjectorRoom` shape exactly, so
 * `+page.svelte` never has to special-case fixture vs real data beyond
 * picking which one to await.
 */
import { FUTURES } from '$lib/game/futures';
import { activeZones, ZONES, type Zone } from '$lib/game/zones';
import { QUESTIONS } from '$lib/game/questions';
import { LENS_IMAGE } from '$lib/game/visuals';
import type { ProjectorRoom, TableBeatState, TableView, ZoneImageState } from '$lib/ui/projector/types';

const TOTAL_STEPS = QUESTIONS.length;

/** Round-robins the 20 tables across the six futures, cycling the 6 beat states so every state has multiple examples. */
const STATE_CYCLE: TableBeatState[] = ['not-started', 'choosing', 'answering', 'answering', 'reviewing', 'drawing', 'drawing', 'done'];

/**
 * A DIFFERENT PICTURE PER ZONE.
 *
 * Every zone of a real table is a different render of one building. If the
 * fixture hands all four zones the same JPEG, the triptych and the
 * crossfade both look broken in a capture when they are not — the first
 * 5760x1080 focus capture showed the same photograph three times. So a
 * fixture zone borrows a NEIGHBOURING future's lens still: obviously fake
 * on inspection, honest about the layout, and still only the six images
 * already in `static/visuals/lens/`.
 */
function zoneLens(futureIndex: number, zoneIndex: number): string {
	const f = FUTURES[(futureIndex + zoneIndex) % FUTURES.length];
	return LENS_IMAGE[f.key];
}

function imagesFor(beatState: TableBeatState, futureIndex: number, zones: readonly Zone[], table: number): TableView['images'] {
	if (beatState === 'not-started' || beatState === 'choosing' || beatState === 'answering' || beatState === 'reviewing') {
		return zones.map((z) => ({ zone: z.key, state: 'none' as ZoneImageState, url: null }));
	}
	return zones.map((z, i) => {
		// A hero table has one image: it is either drawn or it is not, and
		// "half a set has landed" has no meaning for it.
		const drawn = beatState === 'done' || zones.length === 1 || i < 2;
		return {
			zone: z.key,
			state: (drawn ? 'stored' : 'queued') as ZoneImageState,
			// `+ table` so two tables on the same lens do not get the same JPEG.
			// With four zones the zone index already separated them; with ONE
			// image per table it did not, and the first hero reveal capture
			// showed tables 8 and 14 as the same photograph — a fixture
			// artefact that reads as a duplicate-render bug.
			url: drawn ? zoneLens(futureIndex + table, i) : null
		};
	});
}

function buildTable(table: number, zones: readonly Zone[]): TableView {
	const futureIndex = (table - 1) % FUTURES.length;
	const future = FUTURES[futureIndex];
	const beatState = STATE_CYCLE[(table - 1) % STATE_CYCLE.length];
	const step =
		beatState === 'not-started' ? 0 : beatState === 'choosing' ? 1 : beatState === 'answering' ? 3 + (table % 6) : TOTAL_STEPS;
	return {
		table,
		beatState,
		step,
		totalSteps: TOTAL_STEPS,
		futureKey: beatState === 'not-started' ? null : future.key,
		images: imagesFor(beatState, futureIndex, zones, table)
	};
}

function fixtureRoom(zones: readonly Zone[]): ProjectorRoom {
	return {
		// Fixtures carry a beat like real data does, so `?fixtures=1` exercises
		// the same switch. `?beat=` overrides it, which is how the finer beats
		// are demonstrated without a desk.
		beat: 'reveal',
		focusTable: null,
		tables: Array.from({ length: 20 }, (_, i) => buildTable(i + 1, zones))
	};
}

/**
 * `?fixtures=1` shows what the room will actually show — one workspace
 * image per table, the `ZONE_SET` default. The server's value cannot reach
 * a client-side constant, so this follows the DEFAULT rather than the
 * deploy's variable; a room running `ZONE_SET=four` checks its geometry
 * with `?fixtures=four` below.
 */
export const FIXTURE_ROOM: ProjectorRoom = fixtureRoom(activeZones(undefined));

/** `?fixtures=four` — the four-zone geometry, for a room that set ZONE_SET=four. */
export const FIXTURE_ROOM_FOUR: ProjectorRoom = fixtureRoom(ZONES);
