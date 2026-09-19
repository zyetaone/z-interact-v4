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
import { ZONES } from '$lib/game/zones';
import { QUESTIONS } from '$lib/game/questions';
import { LENS_IMAGE } from '$lib/game/visuals';
import type { ProjectorRoom, TableBeatState, TableView, ZoneImageState } from '$lib/ui/projector/types';

const TOTAL_STEPS = QUESTIONS.length;

/** Round-robins the 20 tables across the 7 futures, cycling the 6 beat states so every state has multiple examples. */
const STATE_CYCLE: TableBeatState[] = ['not-started', 'choosing', 'answering', 'answering', 'reviewing', 'drawing', 'drawing', 'done'];

function imagesFor(beatState: TableBeatState, lensUrl: string): TableView['images'] {
	if (beatState === 'not-started' || beatState === 'choosing' || beatState === 'answering' || beatState === 'reviewing') {
		return ZONES.map((z) => ({ zone: z.key, state: 'none' as ZoneImageState, url: null }));
	}
	return ZONES.map((z, i) => {
		const drawn = beatState === 'done' || i < 2;
		return {
			zone: z.key,
			state: (drawn ? 'stored' : 'queued') as ZoneImageState,
			url: drawn ? lensUrl : null
		};
	});
}

function buildTable(table: number): TableView {
	const future = FUTURES[(table - 1) % FUTURES.length];
	const beatState = STATE_CYCLE[(table - 1) % STATE_CYCLE.length];
	const step =
		beatState === 'not-started' ? 0 : beatState === 'choosing' ? 1 : beatState === 'answering' ? 3 + (table % 6) : TOTAL_STEPS;
	return {
		table,
		beatState,
		step,
		totalSteps: TOTAL_STEPS,
		futureKey: beatState === 'not-started' ? null : future.key,
		images: imagesFor(beatState, LENS_IMAGE[future.key])
	};
}

export const FIXTURE_ROOM: ProjectorRoom = {
	// Fixtures carry a beat like real data does, so `?fixtures=1` exercises
	// the same switch. `?beat=` overrides it, which is how the finer beats
	// are demonstrated without a desk.
	beat: 'reveal',
	focusTable: null,
	tables: Array.from({ length: 20 }, (_, i) => buildTable(i + 1))
};
