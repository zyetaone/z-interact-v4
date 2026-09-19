/**
 * PROJECTOR READ — one query, `getProjectorRoom`, feeding all three beats
 * plus the per-table sequence. Reads only through functions `server/room.ts`
 * already exports (per this workstream's brief) — no server file was
 * edited to add this read.
 *
 * One known gap remains, flagged rather than worked around by editing
 * `room.ts`:
 *
 * 1. **`getRoom`'s `currentStep` is hardcoded to 0** for every table —
 *    only the single-table `getTableState` computes a real value, and it
 *    does so via `ensureTableRow`, an upsert, not a plain read. Calling
 *    that 20× on every 3s poll would mean 20 write-shaped calls just to
 *    render a step count, so this file doesn't do that. Every unsubmitted
 *    table buckets to the coarse `answering` state (no `n of 11`) instead.
 *
 * `getCurrentImage` already returns the latest attempt for a table+zone
 * regardless of its state (queued/requested/stored/done/failed, not just
 * terminal ones), so one call per zone is enough to know both whether an
 * image exists and what to show while it doesn't. Skipped entirely for a
 * table that hasn't submitted — `insertQueuedImage` only ever runs after
 * `finishTable`, so an unsubmitted table provably has no image rows.
 */
import { query } from '$app/server';
import { requestEnv, eventId } from '$lib/server/env';
import { getRoom, getCurrentImageSince, getResetAt, getTableFutures, type ImageRow } from '$lib/server/room';
import { TABLE_COUNT, QUESTIONS } from '$lib/game/questions';
import { ZONES } from '$lib/game/zones';
import type { ProjectorRoom, TableBeatState, TableView, ZoneImageState } from '$lib/ui/projector/types';

const TOTAL_STEPS = QUESTIONS.length;

function toZoneView(zoneKey: string, row: ImageRow | null): { zone: string; state: ZoneImageState; url: string | null } {
	if (!row) return { zone: zoneKey, state: 'none', url: null };
	// r2Key is the full-size object (see r2.ts's ponytail note — no tile pass
	// runs yet), served through `projector/img/[...key]`, this workstream's
	// own read-only R2 proxy.
	const url = row.r2Key ? `/projector/img/${row.r2Key}` : null;
	return { zone: zoneKey, state: row.state, url };
}

function inFlight(s: ZoneImageState): boolean {
	return s === 'queued' || s === 'requested';
}

/**
 * Live data can't distinguish `not-started`/`choosing`/`answering` from each
 * other (the module note above — no step-count read that isn't an upsert), so
 * every pre-submit table buckets to `answering` with `step: null`; components
 * render that as a plain "in progress" rather than a fabricated `n of 11`.
 * `?fixtures=1` is the only place the finer three states are demonstrated.
 */
function beatStateFor(submittedAt: number | null, images: TableView['images']): TableBeatState {
	if (submittedAt == null) return 'answering';
	if (images.length === 0) return 'reviewing';
	const stored = (s: ZoneImageState) => s === 'stored' || s === 'done';
	if (images.every((i) => stored(i.state))) return 'done';
	if (images.some((i) => stored(i.state) || inFlight(i.state))) return 'drawing';
	return 'reviewing';
}

export const getProjectorRoom = query(async (): Promise<ProjectorRoom> => {
	const env = requestEnv();
	if (!env) return { tables: [] };
	const event = eventId(env);
	const [snapshot, futures] = await Promise.all([
		getRoom(env.DB, event, TABLE_COUNT),
		getTableFutures(env.DB, event)
	]);

	const tables: TableView[] = await Promise.all(
		snapshot.tables.map(async ({ table, submittedAt }) => {
			// An admin reset (room.ts's `table_reset` watermark) must be visible
			// here too: a pre-reset image row is still "current" to a plain
			// `getCurrentImage` read (append-only, never deleted), so this beat
			// reads SINCE the table's most recent reset — same rule the phone's
			// own `tableStatus` read applies.
			const since = await getResetAt(env.DB, event, table);
			const images = submittedAt
				? await Promise.all(
						ZONES.map(async (z) =>
							toZoneView(z.key, await getCurrentImageSince(env.DB, event, table, z.key, since))
						)
					)
				: [];
			return {
				table,
				beatState: beatStateFor(submittedAt, images),
				// See the module note above — real step counts for in-progress
				// tables need a non-upsert read that doesn't exist yet.
				step: submittedAt ? TOTAL_STEPS : null,
				totalSteps: TOTAL_STEPS,
				futureKey: futures.get(table) ?? null,
				images
			};
		})
	);

	return { tables };
});
