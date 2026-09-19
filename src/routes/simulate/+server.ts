/**
 * REHEARSAL — drives N tables through the REAL code paths, server-side.
 *
 * game-flow.md §8 asks for this explicitly: "a simulator route drives 20
 * tables concurrently against the built app, then reads the room back and
 * asserts it agrees. Run it before the site-tech window, not during."
 *
 * It calls `answers.remote.ts`'s own commands — `saveFuture`, `saveEra`,
 * `saveAnswer`, `saveWildcard`, `finishTable` — rather than writing rows
 * itself. That is the whole point: a rehearsal has to exercise the same
 * gate, the same per-table throttle, the same spend caps and the same
 * prompt composition a phone does. A simulator with its own write path
 * proves only that the simulator works.
 *
 * **It spends real money.** With `FAL_KEY` set and `FAL_FAKE` unset, every
 * table that reaches `finishTable` queues a real render per zone. The
 * per-table cap (`MAX_RENDERS_PER_TABLE`) applies here exactly as it does
 * to a phone — it is not bypassed for rehearsal — and `FAL_FAKE=1` runs the
 * whole loop with no fal call at all.
 *
 * Two gates, both fail closed: `SIMULATE_ENABLED` must be the string
 * `true`, and `ADMIN_TOKEN` must be set AND match (`secretEquals` refuses a
 * missing expected value, so forgetting the variable closes the route
 * rather than opening it).
 */
import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import { envOf, eventId } from '$lib/server/env';
import { secretEquals } from '$lib/server/secret';
import { planRoom, WILDCARD } from '$lib/server/simulate';
import { getTableState } from '$lib/server/room';
import { TABLE_COUNT } from '$lib/game/questions';
import {
	saveAnswer,
	saveEra,
	saveFuture,
	saveWildcard,
	finishTable
} from '../t/[table]/answers.remote';
import type { RequestHandler } from './$types';

const Body = v.object({
	token: v.string(),
	/** How many tables to drive. Defaults to the room's full size. */
	tables: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(TABLE_COUNT))),
	/**
	 * First table to drive. One invocation may make at most ~1000 D1 calls
	 * ("Too many API requests by single Worker invocation", measured live at
	 * 20 tables), so a full room is run as two halves: `{from:1,tables:10}`
	 * then `{from:11,tables:10}`. Plans are seeded over the whole room, so
	 * the halves are the same tables a single run would have produced.
	 */
	from: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(TABLE_COUNT))),
	/** Same seed, same run — a rehearsal that cannot be repeated cannot confirm a fix. */
	seed: v.optional(v.pipe(v.number(), v.integer())),
	/** Milliseconds between one table starting and the next. Twenty phones do not tap in unison. */
	staggerMs: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5000))),
	/** Stop before `finishTable`, so a dry run costs nothing even with a live key. */
	answersOnly: v.optional(v.boolean())
});

interface TableReport {
	table: number;
	futureKey: string;
	era: string;
	saved: number;
	refused: string[];
	submitted: boolean;
	queued: number;
	reason?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Every command returns `{ ok }` rather than throwing (commands cannot use `error()`), so a refusal is data, not an exception. */
function noted(report: TableReport, label: string, result: { ok: boolean; reason?: string }): boolean {
	if (result.ok) {
		report.saved += 1;
		return true;
	}
	report.refused.push(`${label}: ${result.reason ?? 'refused'}`);
	return false;
}

async function runTable(plan: ReturnType<typeof planRoom>[number], answersOnly: boolean): Promise<TableReport> {
	const report: TableReport = {
		table: plan.table,
		futureKey: plan.futureKey,
		era: plan.era,
		saved: 0,
		refused: [],
		submitted: false,
		queued: 0
	};
	try {
		noted(report, 'future', await saveFuture({ table: plan.table, futureKey: plan.futureKey }));
		noted(report, 'era', await saveEra({ table: plan.table, era: plan.era }));
		for (const a of plan.answers) {
			noted(
				report,
				a.questionId,
				await saveAnswer({
					table: plan.table,
					questionId: a.questionId,
					keys: a.keys,
					text: a.text,
					pushReply: a.pushReply
				})
			);
		}
		if (plan.wildcard) {
			noted(report, WILDCARD.id, await saveWildcard({ table: plan.table, text: plan.wildcard }));
		}
		if (!answersOnly) {
			const done = await finishTable({ table: plan.table });
			report.submitted = done.ok;
			if (done.ok) report.queued = done.queued ?? 0;
			else report.reason = done.reason;
		}
	} catch (e) {
		report.reason = String(e).slice(0, 300);
	}
	return report;
}

export const POST: RequestHandler = async ({ request, platform }) => {
	const env = envOf(platform);
	if (!env) return json({ ok: false, reason: 'no environment' }, { status: 503 });

	// Fails closed twice over: off unless explicitly enabled, and shut
	// unless ADMIN_TOKEN is both set and matched.
	if (env.SIMULATE_ENABLED !== 'true') {
		return json({ ok: false, reason: 'simulator is not enabled' }, { status: 404 });
	}

	const raw = await request.json().catch(() => null);
	const parsed = v.safeParse(Body, raw);
	if (!parsed.success) return json({ ok: false, reason: 'invalid body' }, { status: 400 });
	const body = parsed.output;

	if (!secretEquals(env.ADMIN_TOKEN, body.token)) {
		return json({ ok: false, reason: 'bad token' }, { status: 401 });
	}

	const from = body.from ?? 1;
	const tables = Math.min(body.tables ?? TABLE_COUNT, TABLE_COUNT - from + 1);
	const seed = body.seed ?? 1;
	const staggerMs = body.staggerMs ?? 250;
	const startedAt = Date.now();

	// Staggered, then awaited together — twenty phones overlap, they do not
	// take turns. Running them strictly in series would never reproduce the
	// concurrency the compare-and-swap and the throttle exist for.
	const plans = planRoom(TABLE_COUNT, seed).slice(from - 1, from - 1 + tables);
	const runs = plans.map(async (plan, i) => {
		if (staggerMs) await sleep(i * staggerMs);
		return runTable(plan, body.answersOnly === true);
	});
	const reports = await Promise.all(runs);

	// Read the room back and check it agrees, per game-flow.md §8.
	const event = eventId(env);
	const readBack = await Promise.all(
		reports.map(async (r) => {
			const state = await getTableState(env.DB, event, r.table);
			return { table: r.table, currentStep: state.currentStep, submittedAt: state.submittedAt };
		})
	);
	// In answers-only mode nothing submits, so a table submitted on an earlier
	// run would read as a disagreement that is not one.
	const disagreements = body.answersOnly
		? []
		: reports
		.filter((r) => r.submitted !== !!readBack.find((s) => s.table === r.table)?.submittedAt)
		.map((r) => r.table);

	return json({
		ok: true,
		event,
		seed,
		from,
		tables,
		staggerMs,
		answersOnly: body.answersOnly === true,
		elapsedMs: Date.now() - startedAt,
		submitted: reports.filter((r) => r.submitted).length,
		rendersQueued: reports.reduce((n, r) => n + r.queued, 0),
		refusals: reports.flatMap((r) => r.refused),
		/** Tables whose reported submit disagrees with what the room reads back — should always be empty. */
		disagreements,
		reports,
		readBack
	});
};
