/**
 * PROJECTOR READ — one query, `getProjectorRoom`, feeding every beat.
 *
 * Two things changed here, both so the wall follows the desk instead of
 * being driven by hand:
 *
 * 1. **The beat comes from the room, not the URL.** `room_beat` (set by
 *    admin's `setBeat`) is read and returned. `?beat=`/`?table=` survive as
 *    a manual override on the page, for a rehearsal or a stuck desk, but
 *    the normal path is that the operator presses a button and the wall
 *    changes.
 * 2. **One batched read, not `tables × zones` point reads.** The previous
 *    shape called `getCurrentImage` per table per zone inside `Promise.all`
 *    — up to 80 D1 reads every 3 s — while admin's own equivalent was
 *    deliberately batched to four queries with a comment explaining why.
 *    `getAdminRoomRows` is that batched read; it now carries `r2Key` too,
 *    which is the only thing it was missing for this use.
 *
 * That also closes the `currentStep` gap this file used to describe: the
 * batched read already computes each table's answered-question count, so
 * Progress can show a real "n of N" for a table mid-flow instead of
 * bucketing every unsubmitted table to a coarse "answering".
 */
import { query } from '$app/server';
import { requestEnv, eventId } from '$lib/server/env';
import { getAdminRoomRows, getBeat, getTableFutures, type AdminImageState } from '$lib/server/room';
import { TABLE_COUNT, QUESTIONS } from '$lib/game/questions';
import { ZONES } from '$lib/game/zones';
import type { ProjectorRoom, TableBeatState, TableView, ZoneImageState } from '$lib/ui/projector/types';

const TOTAL_STEPS = QUESTIONS.length;

function toZoneView(zoneKey: string, row: AdminImageState | undefined): { zone: string; state: ZoneImageState; url: string | null } {
	if (!row) return { zone: zoneKey, state: 'none', url: null };
	// r2Key is the full-size object (see r2.ts's ponytail note — no tile pass
	// runs yet), served through `projector/img/[...key]`.
	return { zone: zoneKey, state: row.state, url: row.r2Key ? `/projector/img/${row.r2Key}` : null };
}

function inFlight(s: ZoneImageState): boolean {
	return s === 'queued' || s === 'requested';
}

function stored(s: ZoneImageState): boolean {
	return s === 'stored' || s === 'done';
}

/**
 * `not-started` / `choosing` / `answering` are now distinguishable, because
 * the batched read gives a real answered count: nothing answered is
 * not-started, only the future card answered is choosing, anything more is
 * answering.
 */
function beatStateFor(submittedAt: number | null, answered: number, images: TableView['images']): TableBeatState {
	if (submittedAt == null) {
		if (answered === 0) return 'not-started';
		if (answered <= 1) return 'choosing';
		return 'answering';
	}
	if (images.length === 0) return 'reviewing';
	if (images.every((i) => stored(i.state))) return 'done';
	if (images.some((i) => stored(i.state) || inFlight(i.state))) return 'drawing';
	return 'reviewing';
}

export const getProjectorRoom = query(async (): Promise<ProjectorRoom> => {
	const env = requestEnv();
	if (!env) return { beat: 'lobby', focusTable: null, tables: [] };
	const event = eventId(env);

	const [beatState, rows, futures] = await Promise.all([
		getBeat(env.DB, event),
		// Already filtered to what is current SINCE each table's reset
		// watermark — the same rule the phone's own read applies.
		getAdminRoomRows(env.DB, event, TABLE_COUNT),
		getTableFutures(env.DB, event)
	]);

	const tables: TableView[] = rows.map((r) => {
		const byZone = new Map(r.images.map((i) => [i.zoneKey, i]));
		// An unsubmitted table provably has no image rows — `insertQueuedImage*`
		// only ever runs after `finishTable` — so this stays empty rather than
		// rendering four "none" placeholders per table.
		const images = r.submittedAt ? ZONES.map((z) => toZoneView(z.key, byZone.get(z.key))) : [];
		return {
			table: r.table,
			beatState: beatStateFor(r.submittedAt, r.answeredCount, images),
			// Clamped: `answeredCount` counts distinct answered ids — `future`,
			// `q1` (the era chip), V4's nine questions and the wildcard — while
			// `totalSteps` is the nine questions. Unclamped this reads "12 of 11" on a
			// public screen.
			step: Math.min(r.submittedAt ? TOTAL_STEPS : r.answeredCount, TOTAL_STEPS),
			totalSteps: TOTAL_STEPS,
			futureKey: futures.get(r.table) ?? null,
			images
		};
	});

	return { beat: beatState.beat, focusTable: beatState.focusTable, tables };
});
