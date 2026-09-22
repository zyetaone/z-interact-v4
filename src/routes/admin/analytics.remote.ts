/**
 * THE READOUT — `/admin/analytics`, one query, no commands.
 *
 * Behind the same `ADMIN_TOKEN` gate as the desk and read the same way (the
 * token rides on the URL), because it shows every word the room typed.
 *
 * It ticks NOTHING and spends NOTHING. That is deliberate, and it is
 * `/health`'s rule rather than the desk's: this is a page a human refreshes
 * while thinking, and a readout that advances the state machine — or worse,
 * submits a render — is a readout nobody dares open twice. The desk is
 * where the room is driven; this is where it is read.
 */
import * as v from 'valibot';
import { query } from '$app/server';
import { requestEnv, eventId } from '$lib/server/env';
import { getRenderStamps } from '$lib/server/room';
import { exportRoomRows } from '$lib/server/archive';
import { summarise, type Analytics } from '$lib/server/analytics';
import { adminTokenOk } from '$lib/server/admin-gate';
import { maxRendersPerTable } from '$lib/server/limits';
import { QUESTIONS, WILDCARD, TABLE_COUNT } from '$lib/game/questions';
import { FUTURES } from '$lib/game/futures';
import { activeZones } from '$lib/game/zones';

type Env = NonNullable<ReturnType<typeof requestEnv>>;

/** The desk's rule, from the one place that states it. */
function checkToken(env: Env, token: string): boolean {
	return adminTokenOk(env.ADMIN_TOKEN, token, { devOpen: true });
}

export type AnalyticsResult = { ok: true; analytics: Analytics } | { ok: false; reason: string };

export const roomAnalytics = query(v.object({ token: v.string() }), async ({ token }): Promise<AnalyticsResult> => {
	const env = requestEnv();
	if (!env) return { ok: false, reason: 'no environment' };
	if (!checkToken(env, token)) return { ok: false, reason: 'bad token' };
	const event = eventId(env);

	const rows = await exportRoomRows(
		env.DB,
		event,
		TABLE_COUNT,
		activeZones(env.ZONE_SET).map((z) => z.key)
	);

	// Spend comes from the counter the CAP reads, not from the export: the
	// export holds the current image per zone, and a table that regenerated
	// twice paid for rows the export no longer shows. Counted from each
	// table's reset watermark, exactly as `limits.ts` counts it, so a table
	// the desk reset starts its allowance again here too.
	//
	// ONE QUERY, NOT TWENTY. `row.resetAt` is the watermark the export
	// already read, so this never asks D1 for it again — but the first
	// version of this block then awaited `getRenderBudget` once per table,
	// which is twenty sequential round trips against the ~1,000-call
	// ceiling one invocation has (see `/simulate`'s note on splitting a
	// room in half). `getRenderStamps` is the same rows in a single read
	// and the per-table watermark is applied here.
	const stamps = await getRenderStamps(env.DB, event, TABLE_COUNT);
	const rendersByTable = new Map<number, number>();
	for (const row of rows) {
		rendersByTable.set(row.table, stamps.filter((s) => s.table === row.table && s.createdAt > row.resetAt).length);
	}

	return {
		ok: true,
		analytics: summarise({
			rows,
			questions: QUESTIONS,
			wildcard: WILDCARD,
			futures: FUTURES,
			maxRenders: maxRendersPerTable(env.MAX_RENDERS_PER_TABLE),
			rendersByTable,
			now: Date.now()
		})
	};
});
