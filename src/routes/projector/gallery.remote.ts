/**
 * PROJECTOR READ — one query, `getProjectorRoom`, feeding all three beats
 * plus the per-table sequence. Reads only through functions `server/room.ts`
 * already exports (per this workstream's brief) — no server file was
 * edited to add this read.
 *
 * Two known gaps in what's readable today, both flagged rather than worked
 * around by editing `room.ts` (the admin agent is adding both as additive
 * getters; this file keeps neutral fallbacks until they land):
 *
 * 1. **No future-per-table getter exists.** `event_table.future_key` is a
 *    real column (room.ts's `EVENT_TABLE_SCHEMA`), but neither `getRoom`
 *    nor `getTableState` returns it. So `futureKey` is always `null` for
 *    live data — the Progress beat's future-colour dot only appears under
 *    `?fixtures=1`.
 * 2. **`getRoom`'s `currentStep` is hardcoded to 0** for every table —
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
import { getRoom, getCurrentImage, type ImageRow } from '$lib/server/room';
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
 * other (module note #2 — no step-count read that isn't an upsert), so every
 * pre-submit table buckets to `answering` with `step: null`; components
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
	const snapshot = await getRoom(env.DB, event, TABLE_COUNT);

	const tables: TableView[] = await Promise.all(
		snapshot.tables.map(async ({ table, submittedAt }) => {
			const images = submittedAt
				? await Promise.all(
						ZONES.map(async (z) => toZoneView(z.key, await getCurrentImage(env.DB, event, table, z.key)))
					)
				: [];
			return {
				table,
				beatState: beatStateFor(submittedAt, images),
				// See module note #2 — real step counts for in-progress tables
				// need a non-upsert read that doesn't exist yet.
				step: submittedAt ? TOTAL_STEPS : null,
				totalSteps: TOTAL_STEPS,
				futureKey: null, // See module note #1.
				images
			};
		})
	);

	return { tables };
});
