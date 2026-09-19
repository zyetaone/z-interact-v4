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
import { tickAndPersist, realGenerateDeps, buildWebhookUrl } from '$lib/server/ticker';
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

export const adminRoom = query(v.object({ token: tokenField }), async ({ token }) => {
	const env = requestEnv();
	if (!env || !checkToken(env, token)) return emptyRoom();
	const event = eventId(env);

	// TICKER: walk EVERY non-terminal image in the event. Three things this
	// loop used to get wrong, all of which only bite the rows the admin poll
	// happens to reach first:
	//
	//  1. It submitted `prompt.composed` bare — the TABLE-level text, with no
	//     zone suffix and no house negative. A row this ticker won was drawn
	//     from a different prompt than the same row drawn by the phone poll.
	//     It now runs `composeZonePrompt` exactly as `tableStatus` does.
	//  2. It called `realGenerateDeps` with five arguments, omitting the
	//     webhook URL, so any row it claimed was poll-only for the rest of
	//     its life.
	//  3. Answers are read once per TABLE, not once per row — this loop runs
	//     on a 3 s poll across the whole event.
	const pending = await getPendingImagesForEvent(env.DB, event);
	const answersByTable = new Map<number, AnswerLike[]>();
	for (const row of pending) {
		if (!answersByTable.has(row.table)) {
			const since = await getResetAt(env.DB, event, row.table);
			const rows = await getCurrentAnswersSince(env.DB, event, row.table, since);
			answersByTable.set(
				row.table,
				rows.map((r) => ({ questionId: r.questionId, keys: r.keys, text: r.text, pushReply: r.pushReply }))
			);
		}
		const zone = ZONES.find((z) => z.key === row.zoneKey);
		const prompt = await getPromptRowById(env.DB, row.promptId);
		if (!zone || !prompt) continue;
		await tickAndPersist(
			env.DB,
			{
				id: row.id,
				state: row.state,
				falRequestId: row.falRequestId,
				createdAt: row.createdAt,
				table: row.table,
				zoneKey: row.zoneKey
			},
			composeZonePrompt(prompt.composed, resolveZone(zone, answersByTable.get(row.table) ?? []), prompt.negative),
			realGenerateDeps(
				env,
				event,
				row.table,
				row.zoneKey,
				row.id,
				buildWebhookUrl(requestOrigin(), env.FAL_WEBHOOK_SECRET, row.id)
			)
		);
	}

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
export const regenerateTable = command(v.object({ token: tokenField, table: tableNo }), async ({ token, table }) => {
	const env = requestEnv();
	if (!env) return { ok: false as const, reason: 'no environment' };
	if (!checkToken(env, token)) return { ok: false as const, reason: 'bad token' };
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
			about: ZONES.length,
			max: maxRendersPerTable(env.MAX_RENDERS_PER_TABLE)
		});
		if (!cap.ok) return { ok: false as const, reason: cap.reason };

		// Which zones have something to regenerate, and the prompt they were
		// drawn from. A zone that never drew is skipped, not failed.
		const existingByZone = new Map<string, NonNullable<Awaited<ReturnType<typeof getCurrentImage>>>>();
		for (const zone of ZONES) {
			const existing = await getCurrentImage(env.DB, event, table, zone.key);
			if (existing) existingByZone.set(zone.key, existing);
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
		const answerRows = await getCurrentAnswersSince(env.DB, event, table, since);
		const answers: AnswerLike[] = answerRows.map((r) => ({
			questionId: r.questionId,
			keys: r.keys,
			text: r.text,
			pushReply: r.pushReply
		}));

		let queued = 0;
		for (const zone of ZONES) {
			const existing = existingByZone.get(zone.key);
			if (!existing) continue;
			const zonePrompt = composeZonePrompt(composed, resolveZone(zone, answers), negative);
			// Same single-statement guard the phone uses: a zone with a live
			// attempt is skipped rather than given a second one.
			const image = await insertQueuedImageIfIdle(
				env.DB,
				{
					eventId: event,
					table,
					zoneKey: zone.key,
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
				tickAndPersist(
					env.DB,
					{
						id: image.id,
						state: image.state,
						falRequestId: image.falRequestId,
						createdAt: image.createdAt,
						table,
						zoneKey: zone.key
					},
					zonePrompt,
					realGenerateDeps(env, event, table, zone.key, image.id, buildWebhookUrl(requestOrigin(), env.FAL_WEBHOOK_SECRET, image.id))
				)
			);
			queued++;
		}
		if (queued === 0) return { ok: false as const, reason: `table ${table} has no prior renders to regenerate` };
		return { ok: true as const, queued };
	} finally {
		throttle.release(table);
	}
});

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
