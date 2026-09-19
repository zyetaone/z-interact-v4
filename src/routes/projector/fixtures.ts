/**
 * FIXTURES — 20 fake tables in mixed states, behind `?fixtures=1`, so the
 * three beats and the per-table sequence render with no D1/R2 at all. Tile
 * "images" are inline SVG data URIs (a few KB each, generated here, not
 * fetched) — enough to exercise the crossfade and grid layout without a
 * real render pipeline or network access.
 *
 * Mirrors `gallery.remote.ts`'s `ProjectorRoom` shape exactly, so
 * `+page.svelte` never has to special-case fixture vs real data beyond
 * picking which one to await.
 */
import { FUTURES } from '$lib/game/futures';
import { ZONES } from '$lib/game/zones';
import { QUESTIONS } from '$lib/game/questions';
import { accentForFuture } from '$lib/ui/projector/tokens';
import type { ProjectorRoom, TableBeatState, TableView, ZoneImageState } from '$lib/ui/projector/types';

const TOTAL_STEPS = QUESTIONS.length;

/** No baked-in caption at the bottom edge — Reveal/TableSequence already
 *  overlay their own table-no/future caption there; a second label in the
 *  same corner just doubles up. `sub` (the zone key) is centered instead,
 *  purely so a dev glancing at the fixture grid can tell the zones apart. */
function svgTile(color: string, label: string, sub: string): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="384" viewBox="0 0 512 384">
		<rect width="512" height="384" fill="${color}"/>
		<rect width="512" height="384" fill="#000000" opacity="0.18"/>
		<text x="256" y="182" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#ffffff">${label}</text>
		<text x="256" y="214" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#ffffff" opacity="0.75">${sub}</text>
	</svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Round-robins the 20 tables across the 7 futures, cycling the 6 beat states so every state has multiple examples. */
const STATE_CYCLE: TableBeatState[] = ['not-started', 'choosing', 'answering', 'answering', 'reviewing', 'drawing', 'drawing', 'done'];

function imagesFor(beatState: TableBeatState, futureName: string, futureColor: string): TableView['images'] {
	if (beatState === 'not-started' || beatState === 'choosing' || beatState === 'answering' || beatState === 'reviewing') {
		return ZONES.map((z) => ({ zone: z.key, state: 'none' as ZoneImageState, url: null }));
	}
	return ZONES.map((z, i) => {
		const drawn = beatState === 'done' || i < 2;
		return {
			zone: z.key,
			state: (drawn ? 'stored' : 'queued') as ZoneImageState,
			url: drawn ? svgTile(futureColor, futureName, z.key) : null
		};
	});
}

function buildTable(table: number): TableView {
	const future = FUTURES[(table - 1) % FUTURES.length];
	const futureIndex = FUTURES.findIndex((f) => f.key === future.key);
	const beatState = STATE_CYCLE[(table - 1) % STATE_CYCLE.length];
	const step =
		beatState === 'not-started' ? 0 : beatState === 'choosing' ? 1 : beatState === 'answering' ? 3 + (table % 6) : TOTAL_STEPS;
	return {
		table,
		beatState,
		step,
		totalSteps: TOTAL_STEPS,
		futureKey: beatState === 'not-started' ? null : future.key,
		images: imagesFor(beatState, future.name, accentForFuture(futureIndex))
	};
}

export const FIXTURE_ROOM: ProjectorRoom = {
	tables: Array.from({ length: 20 }, (_, i) => buildTable(i + 1))
};
