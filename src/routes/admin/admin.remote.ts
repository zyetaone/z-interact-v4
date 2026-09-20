/**
 * Admin mission control (game-flow.md §5, §8). `+page.svelte`'s screen is
 * one poll (`adminRoom`) plus eight commands.
 *
 * ponytail: `ADMIN_TOKEN` is a shared-secret query param carried on the
 * hidden admin URL (`?token=...`), checked on every command AND on the
 * poll query itself — not real auth, just a gate against a stranger who
 * doesn't have the URL. `env.ts` now declares `ADMIN_TOKEN` on its `Env`
 * type, so `checkToken` reads it directly. It fails OPEN (any token,
 * including empty, passes) only in `dev` — so `npm run dev` keeps working
 * without a `.dev.vars` entry — and fails CLOSED (every token rejected) in
 * production when the var is unset, so a real event can't ship with the
 * admin screen wide open by omission.
 */
import * as v from 'valibot';
import { command, query } from '$app/server';
import { dev } from '$app/environment';
import { requestEnv, eventId, requestOrigin, requestWaitUntil } from '$lib/server/env';
import { lockedAt, setLocked, grantReopen, grantedTables } from '$lib/server/gate';
import {
	getPendingImagesForEvent,
	getCurrentAnswersSince,
	getCurrentImage,
	getCurrentImageSince,
	insertQueuedImageIfIdle,
	getRenderBudget,
	getResetAt,
	insertPrompt,
	getPromptRowById,
	getAdminRoomRows,
	getTableFutures,
	countTables,
	seedTables,
	resetTable as resetTableRow,
	setBeat as setBeatRow,
	getBeat,
	exportRoomRows,
	type Beat
} from '$lib/server/room';
import { tickImageRow, tickRowSafely } from '$lib/server/ticker';
import { createThrottle } from '$lib/server/throttle';
import { checkRenderCap, maxRendersPerTable } from '$lib/server/limits';
import { FAL_MODEL } from '$lib/server/fal';
import { TABLE_COUNT, QUESTIONS } from '$lib/game/questions';
import { ZONES } from '$lib/game/zones';
import { composeZonePrompt, resolveZone, type AnswerLike } from '../t/[table]/layers';
import type { AdminRoom } from '$lib/ui/admin/types';

const tableNo = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(TABLE_COUNT));
const tokenField = v.string();
const BeatSchema = v.picklist(['lobby', 'progress', 'reveal', 'focus', 'finale']) satisfies v.GenericSchema<string, Beat>;

// The stored `model` column. The submit itself reads `fal.ts`'s own
// constant; these disagreeing is how a row ends up recording a model it was
// never generated with, so this imports the same value.
const MODEL = FAL_MODEL;

/**
 * Rows this poll will advance, oldest first. Overridable with
 * `ADMIN_TICK_BUDGET` for a rehearsal that wants the desk to carry more of
 * the room. Never unbounded: that is the bug this constant exists for.
 */
const DEFAULT_ADMIN_TICK_BUDGET = 8;

function adminTickBudget(raw: string | undefined): number {
	const n = Number(raw);
	return Number.isInteger(n) && n > 0 ? n : DEFAULT_ADMIN_TICK_BUDGET;
}

/** How settled a row must be before the DESK's ticker touches it — the phone's own 2 s poll gets first refusal on a row its table is watching. */
const ADMIN_TICK_COOLDOWN_MS = 3000;
const TOTAL_STEPS = QUESTIONS.length;

// One per isolate, separate from the phone's own throttle instance in
// answers.remote.ts — regenerate applies the same per-table rule
// (game-flow.md §8), keyed here rather than shared across modules.
const throttle = createThrottle();

type Env = NonNullable<ReturnType<typeof requestEnv>>;

function checkToken(env: Env, token: string): boolean {
	const expected = env.ADMIN_TOKEN;
	if (!expected) return dev; // unset: open in dev, closed in production
	return token === expected;
}

function emptyRoom(): AdminRoom {
	return { closed: false, beat: 'lobby', focusTable: null, seeded: false, tables: [] };
}

/* -------------------------------------------------------------------------- */
/* Read + ticker — one poll for the whole screen (game-flow.md §6/§8):       */
/* room lock, beat, every table row, AND the third of the three tickers      */
/* alongside `answers.remote.ts`'s `tableStatus` and the fal webhook.        */
/* -------------------------------------------------------------------------- */

/**
 * Advances a bounded slice of the event's pending rows. Called from the
 * admin poll inside `waitUntil`, so nothing here is on the response path.
 *
 * Three things this loop used to get wrong, all of which only bit the rows
 * the admin poll happened to reach first:
 *
 *  1. It submitted `prompt.composed` bare — the TABLE-level text, with no
 *     zone suffix and no house negative. A row this ticker won was drawn
 *     from a different prompt than the same row drawn by the phone poll.
 *     It now runs `composeZonePrompt` exactly as `tableStatus` does.
 *  2. It called `realGenerateDeps` with five arguments, omitting the
 *     webhook URL, so any row it claimed was poll-only for the rest of
 *     its life.
 *  3. Answers were read once per ROW rather than once per table.
 *
 * OLDEST FIRST, so nothing starves: a row skipped this poll is older next
 * poll and rises to the front. And a cooling-off window, so this ticker
 * stops racing the phone's own 2 s poll for a row that was just touched —
 * the compare-and-swap makes that safe, but a lost race is still a wasted
 * fal round trip.
 */
async function tickSlice(env: Env, event: string): Promise<void> {
	const now = Date.now();
	const pending = (await getPendingImagesForEvent(env.DB, event))
		.filter((r) => now - r.createdAt > ADMIN_TICK_COOLDOWN_MS)
		.sort((a, b) => a.createdAt - b.createdAt)
		.slice(0, adminTickBudget(env.ADMIN_TICK_BUDGET));
	if (pending.length === 0) return;

	// Read once per TABLE, not once per row: the lens picture and the reset
	// watermark are table-wide, and this loop runs on a 3 s poll.
	const futuresForTick = await getTableFutures(env.DB, event);
	const answersByTable = new Map<number, AnswerLike[]>();
	const resetByTable = new Map<number, number>();
	for (const row of pending) {
		if (!answersByTable.has(row.table)) {
			const since = await getResetAt(env.DB, event, row.table);
			resetByTable.set(row.table, since);
			const rows = await getCurrentAnswersSince(env.DB, event, row.table, since);
			answersByTable.set(
				row.table,
				rows.map((r) => ({ questionId: r.questionId, keys: r.keys, text: r.text, pushReply: r.pushReply }))
			);
		}
		const zone = ZONES.find((z) => z.key === row.zoneKey);
		const prompt = await getPromptRowById(env.DB, row.promptId);
		if (!zone || !prompt) continue;
		// One row's throw must not end the slice: the rows behind it would
		// wait for a later poll to reach them, oldest-first, for ever.
		await tickRowSafely(
			{
				db: env.DB,
				env,
				event,
				origin: requestOrigin(),
				futureKey: futuresForTick.get(row.table) ?? null,
				since: resetByTable.get(row.table) ?? 0
			},
			{
				id: row.id,
				state: row.state,
				falRequestId: row.falRequestId,
				createdAt: row.createdAt,
				table: row.table,
				zoneKey: row.zoneKey
			},
			composeZonePrompt(prompt.composed, resolveZone(zone, answersByTable.get(row.table) ?? []), prompt.negative)
		);
	}
}

export const adminRoom = query(v.object({ token: tokenField }), async ({ token }) => {
	const env = requestEnv();
	if (!env || !checkToken(env, token)) return emptyRoom();
	const event = eventId(env);

	// THE DESK ANSWERS FROM D1. THE TICK HAPPENS AFTERWARDS.
	//
	// Measured live with ~60 rows pending after the 20-table render run:
	// `GET /admin?token=...` took 36.6 s and 35.3 s on two runs, against
	// 0.7 s for the projector. The row budget below was already in place —
	// what was missing is that the request AWAITED those eight ticks, and
	// eight fal round trips with a fetch of the finished bytes is most of
	// half a minute. On the night that is the desk frozen while the room
	// renders, which is the one screen that must never be.
	//
	// So the tick moves into `waitUntil`: the response goes out on the D1
	// reads alone, and the slice advances after it. Each 3 s poll still
	// carries a slice, and the phones' own 2 s polls carry the rest. The
	// compare-and-swap in `room.ts` is what makes overlapping tickers safe.
	requestWaitUntil(tickSlice(env, event));

	const [closed, beatState, rows, futures, granted, tableCount] = await Promise.all([
		lockedAt(env.DB, event),
		getBeat(env.DB, event),
		getAdminRoomRows(env.DB, event, TABLE_COUNT),
		getTableFutures(env.DB, event),
		grantedTables(env.DB, event),
		countTables(env.DB, event)
	]);

	const room: AdminRoom = {
		closed: !!closed,
		beat: beatState.beat,
		focusTable: beatState.focusTable,
		seeded: tableCount > 0,
		tables: rows.map((r) => {
			const imagesByZone = new Map(r.images.map((i) => [i.zoneKey, i]));
			const images = ZONES.map((z) => imagesByZone.get(z.key)?.state ?? ('none' as const));
			return {
				table: r.table,
				futureKey: futures.get(r.table) ?? null,
				// Clamped for the same reason as the projector's own read:
				// `answeredCount` includes `future`, `q1` and the wildcard.
				step: Math.min(r.answeredCount, TOTAL_STEPS),
				totalSteps: TOTAL_STEPS,
				submittedAt: r.submittedAt,
				images,
				imageErrors: ZONES.map((z) => imagesByZone.get(z.key)?.error ?? null),
				imagesStored: images.filter((s) => s === 'stored' || s === 'done').length,
				lastActivityAt: r.lastSeenAt,
				granted: granted.has(r.table)
			};
		})
	};
	return room;
});

/* -------------------------------------------------------------------------- */
/* Room lock                                                                  */
/* -------------------------------------------------------------------------- */

export const lockRoom = command(v.object({ token: tokenField }), async ({ token }) => {
	const env = requestEnv();
	if (!env) return { ok: false as const, reason: 'no environment' };
	if (!checkToken(env, token)) return { ok: false as const, reason: 'bad token' };
	await setLocked(env.DB, eventId(env), true);
	return { ok: true as const };
});

export const openRoom = command(v.object({ token: tokenField }), async ({ token }) => {
	const env = requestEnv();
	if (!env) return { ok: false as const, reason: 'no environment' };
	if (!checkToken(env, token)) return { ok: false as const, reason: 'bad token' };
	await setLocked(env.DB, eventId(env), false);
	return { ok: true as const };
});

/* -------------------------------------------------------------------------- */
/* Beat — drives the projector (game-flow.md §4/§5).                         */
/* -------------------------------------------------------------------------- */

export const setBeat = command(
	v.object({ token: tokenField, beat: BeatSchema, table: v.optional(tableNo) }),
	async ({ token, beat, table }) => {
		const env = requestEnv();
		if (!env) return { ok: false as const, reason: 'no environment' };
		if (!checkToken(env, token)) return { ok: false as const, reason: 'bad token' };
		if (beat === 'focus' && !table) return { ok: false as const, reason: 'focus needs a table number' };
		await setBeatRow(env.DB, eventId(env), beat, beat === 'focus' ? (table ?? null) : null);
		return { ok: true as const };
	}
);

/* -------------------------------------------------------------------------- */
/* Per-table verbs                                                           */
/* -------------------------------------------------------------------------- */

/** The single-table reopen grant (gate.ts) — "table 6 — do you want me to reset?" (presence-anatomy.md's gate note). */
export const reopenTable = command(v.object({ token: tokenField, table: tableNo }), async ({ token, table }) => {
	const env = requestEnv();
	if (!env) return { ok: false as const, reason: 'no environment' };
	if (!checkToken(env, token)) return { ok: false as const, reason: 'bad token' };
	await grantReopen(env.DB, eventId(env), table);
	return { ok: true as const };
});

/** Appends a reset watermark (room.ts's `resetTable`) — never deletes; every prior answer/prompt/image row stays in D1. */
export const resetTable = command(v.object({ token: tokenField, table: tableNo }), async ({ token, table }) => {
	const env = requestEnv();
	if (!env) return { ok: false as const, reason: 'no environment' };
	if (!checkToken(env, token)) return { ok: false as const, reason: 'bad token' };
	await resetTableRow(env.DB, eventId(env), table, 'admin');
	return { ok: true as const };
});

/**
 * Appends a new image set, copying the table's current prompt forward
 * (never re-deriving it from answers — that composition belongs to
 * `routes/t/[table]`'s own screens) and kicking a fresh tick. A zone that
 * never drew has nothing to regenerate and is skipped, not failed; the call
 * only fails if every zone was skipped.
 *
 * ONE prompt row per table, matching the rule `answers.remote.ts` states.
 * This used to insert one per zone, which left `getLatestPrompt` choosing
 * between four near-identical rows written in the same breath.
 */
export const regenerateTable = command(
	v.object({ token: tokenField, table: tableNo, zone: v.optional(v.string()) }),
	async ({ token, table, zone }) => {
	const env = requestEnv();
	if (!env) return { ok: false as const, reason: 'no environment' };
	if (!checkToken(env, token)) return { ok: false as const, reason: 'bad token' };
	// ONE ZONE, OPTIONALLY. The 20-table run lost a single zone on four
	// tables; redrawing all four to recover one spends four of that table's
	// twelve. With `zone` the desk repairs exactly the tile that failed,
	// and the cap counts one render rather than four.
	const zones = zone ? ZONES.filter((z) => z.key === zone) : ZONES;
	if (zones.length === 0) return { ok: false as const, reason: `unknown zone ${zone}` };
	if (!throttle.acquire(table)) return { ok: false as const, reason: 'This table is already drawing — hang tight.' };
	try {
		const event = eventId(env);
		const since = await getResetAt(env.DB, event, table);
		// The per-table cap is a SPEND cap, so it binds the desk too. The
		// cooldown does not: that one exists to stop a phone being tapped
		// repeatedly, and the desk acting deliberately is the case it is meant
		// to leave room for. `resetTable` is the desk's way past the cap.
		const budget = await getRenderBudget(env.DB, event, table, since);
		const cap = checkRenderCap({
			used: budget.used,
			about: zones.length,
			max: maxRendersPerTable(env.MAX_RENDERS_PER_TABLE)
		});
		if (!cap.ok) return { ok: false as const, reason: cap.reason };

		// Which zones have something to regenerate, and the prompt they were
		// drawn from. A zone that never drew is skipped, not failed.
		const existingByZone = new Map<string, NonNullable<Awaited<ReturnType<typeof getCurrentImage>>>>();
		for (const z of zones) {
			// Since the reset, for the same reason the phone's submit path is:
			// a pre-reset row is not this table's current work.
			const existing = await getCurrentImageSince(env.DB, event, table, z.key, since);
			if (existing) existingByZone.set(z.key, existing);
		}
		if (existingByZone.size === 0) {
			return { ok: false as const, reason: `table ${table} has no prior renders to regenerate` };
		}

		// ONE prompt row for the table, not one per zone — the rule
		// `answers.remote.ts` states and holds to ("`schema.draft.ts`'s
		// `PromptRow` has no zone column"). Writing four near-identical rows
		// per regenerate made `getLatestPrompt` a coin toss between them.
		const anyExisting = [...existingByZone.values()][0];
		const prevPrompt = await getPromptRowById(env.DB, anyExisting.promptId);
		const composed = prevPrompt?.composed ?? '';
		const negative = prevPrompt?.negative ?? '';
		const promptId = await insertPrompt(env.DB, {
			eventId: event,
			table,
			mood: prevPrompt?.mood ?? '',
			material: prevPrompt?.material ?? '',
			programme: prevPrompt?.programme ?? '',
			feel: prevPrompt?.feel ?? '',
			wildcard: prevPrompt?.wildcard ?? undefined,
			composed,
			negative,
			editedByTable: prevPrompt?.editedByTable ?? false,
			actor: 'admin',
			supersedesId: anyExisting.promptId
		});

		// The zone suffix and the house negative, same composer the phone uses.
		const regenFutures = await getTableFutures(env.DB, event);
		const answerRows = await getCurrentAnswersSince(env.DB, event, table, since);
		const answers: AnswerLike[] = answerRows.map((r) => ({
			questionId: r.questionId,
			keys: r.keys,
			text: r.text,
			pushReply: r.pushReply
		}));

		let queued = 0;
		for (const z of zones) {
			const existing = existingByZone.get(z.key);
			if (!existing) continue;
			const zonePrompt = composeZonePrompt(composed, resolveZone(z, answers), negative);
			// Same single-statement guard the phone uses: a zone with a live
			// attempt is skipped rather than given a second one.
			const image = await insertQueuedImageIfIdle(
				env.DB,
				{
					eventId: event,
					table,
					zoneKey: z.key,
					promptId,
					prompt: zonePrompt,
					model: MODEL,
					actor: 'admin',
					supersedesId: existing.id
				},
				since
			);
			if (!image) continue;
			await requestWaitUntil(
				tickImageRow(
					{
						db: env.DB,
						env,
						event,
						origin: requestOrigin(),
						futureKey: regenFutures.get(table) ?? null,
						since
					},
					{
						id: image.id,
						state: image.state,
						falRequestId: image.falRequestId,
						createdAt: image.createdAt,
						table,
						zoneKey: z.key
					},
					zonePrompt
				)
			);
			queued++;
		}
		if (queued === 0) return { ok: false as const, reason: `table ${table} has no prior renders to regenerate` };
		return { ok: true as const, queued };
	} finally {
		throttle.release(table);
	}
	}
);

/* -------------------------------------------------------------------------- */
/* Whole-room verbs                                                          */
/* -------------------------------------------------------------------------- */

/** "Refuses if the room is not empty" (game-flow.md §5). */
export const seedRoom = command(v.object({ token: tokenField }), async ({ token }) => {
	const env = requestEnv();
	if (!env) return { ok: false as const, reason: 'no environment' };
	if (!checkToken(env, token)) return { ok: false as const, reason: 'bad token' };
	return seedTables(env.DB, eventId(env), TABLE_COUNT);
});

/** One JSON of every row for the event — "taken before any destructive verb" (game-flow.md §5); this workstream doesn't wire that ordering, just the read itself. */
export const exportRoom = query(v.object({ token: tokenField }), async ({ token }) => {
	const env = requestEnv();
	if (!env) return { ok: false as const, reason: 'no environment' };
	if (!checkToken(env, token)) return { ok: false as const, reason: 'bad token' };
	const event = eventId(env);
	const tables = await exportRoomRows(env.DB, event, TABLE_COUNT, ZONES.map((z) => z.key));
	return { ok: true as const, exportedAt: Date.now(), tables };
});
