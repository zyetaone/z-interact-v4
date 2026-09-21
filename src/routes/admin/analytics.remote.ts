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
import { dev } from '$app/environment';
import { requestEnv, eventId } from '$lib/server/env';
import { exportRoomRows, getRenderBudget } from '$lib/server/room';
import { summarise, type Analytics } from '$lib/server/analytics';
import { secretEquals } from '$lib/server/secret';
import { maxRendersPerTable } from '$lib/server/limits';
import { QUESTIONS, WILDCARD, TABLE_COUNT } from '$lib/game/questions';
import { FUTURES } from '$lib/game/futures';
import { activeZones } from '$lib/game/zones';

type Env = NonNullable<ReturnType<typeof requestEnv>>;

/** The desk's rule, verbatim: unset is open in dev and closed in production. */
function checkToken(env: Env, token: string): boolean {
	const expected = env.ADMIN_TOKEN;
	if (!expected) return dev;
	return secretEquals(token, expected);
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
	// `row.resetAt` is the watermark the export already read — asking D1 for
	// it again would be twenty more queries against the ~1,000-call ceiling
	// one invocation has (see `/simulate`'s note on splitting a room in half).
	const rendersByTable = new Map<number, number>();
	for (const row of rows) {
		const { used } = await getRenderBudget(env.DB, event, row.table, row.resetAt);
		rendersByTable.set(row.table, used);
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
