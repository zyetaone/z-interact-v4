/**
 * PROJECTOR READ — one query, `getProjectorRoom`, feeding all three beats
 * plus the per-table sequence. Reads only through functions `server/room.ts`
 * and `server/generate.ts` already export (the generation state machine
 * moved into `generate.ts`'s `generations` table under this workstream's
 * feet mid-build — `room.ts`'s `images` table is now only the append-only
 * "which render is current" pointer, no `state` column at all). No server
 * file was edited to add this read.
 *
 * Two known gaps in what's readable today, both flagged rather than worked
 * around by editing a server file:
 *
 * 1. **No future-per-table getter exists.** `event_table.future_key` is a
 *    real column (room.ts's `EVENT_TABLE_SCHEMA`), but neither `getRoom`
 *    nor `getTableState` returns it. So `futureKey` is always `null` for
 *    live data — the Progress beat's future-colour dot only appears under
 *    `?fixtures=1`. Upgrade: add `futureKey` to `TableState` in room.ts.
 * 2. **`getRoom`'s `currentStep` is hardcoded to 0** for every table —
 *    only the single-table `getTableState` computes a real value, and it
 *    does so via `ensureTableRow`, an upsert, not a plain read. Calling
 *    that 20× on every 3s poll would mean 20 write-shaped calls just to
 *    render a step count, so this file doesn't do that. Every unsubmitted
 *    table buckets to the coarse `answering` state (no `n of 11`) instead.
 *
 * Image status is two reads per zone in the worst case (`getCurrentImage`,
 * then `getLatestGeneration` if nothing's current yet) and is skipped
 * entirely for a table that hasn't submitted — `insertGeneration` only
 * ever runs after `finishTable`, so an unsubmitted table provably has no
 * generation rows. `// ponytail:` a batched per-event read in either file
 * would remove the remaining N+1; out of scope here.
 */
import { query } from '$app/server';
import { requestEnv, eventId } from '$lib/server/env';
import { getRoom, getCurrentImage } from '$lib/server/room';
import { getLatestGeneration } from '$lib/server/generate';
import { TABLE_COUNT, QUESTIONS } from '$lib/game/questions';
import { ZONES } from '$lib/game/zones';
import type { ProjectorRoom, TableBeatState, TableView, ZoneImageState } from '$lib/ui/projector/types';

const TOTAL_STEPS = QUESTIONS.length;

async function zoneStatus(
	db: D1Database,
	event: string,
	table: number,
	zoneKey: string
): Promise<{ zone: string; state: ZoneImageState; url: string | null }> {
	const current = await getCurrentImage(db, event, table, zoneKey);
	if (current) {
		return { zone: zoneKey, state: 'stored', url: `/projector/img/${current.r2Key}` };
	}
	const gen = await getLatestGeneration(db, event, table, zoneKey);
	return { zone: zoneKey, state: (gen?.state ?? 'none') as ZoneImageState, url: null };
}

function inFlight(s: ZoneImageState): boolean {
	return s === 'queued' || s === 'submitted' || s === 'rendering';
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
	if (images.every((i) => i.state === 'stored')) return 'done';
	if (images.some((i) => i.state === 'stored' || inFlight(i.state))) return 'drawing';
	return 'reviewing';
}

export const getProjectorRoom = query(async (): Promise<ProjectorRoom> => {
	const env = requestEnv();
	if (!env) return { tables: [] };
	const event = eventId(env);
	const snapshot = await getRoom(env.DB, event, TABLE_COUNT);

	const tables: TableView[] = await Promise.all(
		snapshot.tables.map(async ({ table, submittedAt }) => {
			const images = submittedAt ? await Promise.all(ZONES.map((z) => zoneStatus(env.DB, event, table, z.key))) : [];
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
