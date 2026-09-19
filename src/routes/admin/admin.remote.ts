/**
 * Admin mission control (game-flow.md §5, §8). `+page.svelte`'s screen is
 * one poll (`adminRoom`) plus eight commands.
 *
 * ponytail: `ADMIN_TOKEN` is a shared-secret query param carried on the
 * hidden admin URL (`?token=...`), checked on every command AND on the
 * poll query itself — not real auth, just a gate against a stranger who
 * doesn't have the URL. `env.ts` (out of this workstream's ownership) does
 * not declare `ADMIN_TOKEN` on its `Env` type yet, so `checkToken` reads it
 * via a loose cast rather than adding the field there; flagged as a
 * follow-up for whoever owns `env.ts`. Fails OPEN (any token, including
 * empty, passes) when the var is unset, so `npm run dev` keeps working
 * without a `.dev.vars` entry — tighten to fail closed before a real event.
 */
import * as v from 'valibot';
import { command, query } from '$app/server';
import { requestEnv, eventId, requestOrigin, requestWaitUntil } from '$lib/server/env';
import { lockedAt, setLocked, grantReopen, grantedTables } from '$lib/server/gate';
import {
	getPendingImagesForEvent,
	getCurrentImage,
	insertQueuedImage,
	insertPrompt,
	getPromptRowById,
	getAdminRoomRows,
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
import { TABLE_COUNT, QUESTIONS } from '$lib/game/questions';
import { ZONES } from '$lib/game/zones';
import type { AdminRoom } from '$lib/ui/admin/types';

const tableNo = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(TABLE_COUNT));
const tokenField = v.string();
const BeatSchema = v.picklist(['lobby', 'progress', 'reveal', 'focus']) satisfies v.GenericSchema<string, Beat>;

const FAL_MODEL = 'TODO(content): fal model id';
const TOTAL_STEPS = QUESTIONS.length;

// One per isolate, separate from the phone's own throttle instance in
// answers.remote.ts — regenerate applies the same per-table rule
// (game-flow.md §8), keyed here rather than shared across modules.
const throttle = createThrottle();

type Env = NonNullable<ReturnType<typeof requestEnv>>;

function checkToken(env: Env, token: string): boolean {
	const expected = (env as unknown as Record<string, string | undefined>).ADMIN_TOKEN;
	if (!expected) return true;
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

	// TICKER: walk EVERY non-terminal image in the event.
	// TODO(content/plumbing): same placeholder `answers.remote.ts`'s
	// `tableStatus` already carries — reading the real composed prompt by
	// `row.promptId` (via `getPromptRowById`, added by this workstream) is
	// a one-line follow-up once that placeholder is retired everywhere.
	for (const row of await getPendingImagesForEvent(env.DB, event)) {
		await tickAndPersist(
			env.DB,
			{ id: row.id, state: row.state, falRequestId: row.falRequestId, table: row.table, zoneKey: row.zoneKey },
			'TODO(content): prompt',
			realGenerateDeps(env, event, row.table, row.zoneKey, row.id)
		);
	}

	const [closed, beatState, rows, granted, tableCount] = await Promise.all([
		lockedAt(env.DB, event),
		getBeat(env.DB, event),
		getAdminRoomRows(env.DB, event, TABLE_COUNT),
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
				futureKey: r.futureKey,
				step: r.answeredCount,
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
 * Appends a new image set per zone, copying each zone's current prompt
 * forward (never re-deriving it from answers — that composition belongs to
 * `routes/t/[table]`'s own screens, not this file) and kicking a fresh
 * tick. A zone that never drew has nothing to regenerate and is skipped,
 * not failed — the whole call only fails if every zone was skipped.
 */
export const regenerateTable = command(v.object({ token: tokenField, table: tableNo }), async ({ token, table }) => {
	const env = requestEnv();
	if (!env) return { ok: false as const, reason: 'no environment' };
	if (!checkToken(env, token)) return { ok: false as const, reason: 'bad token' };
	if (!throttle.acquire(table)) return { ok: false as const, reason: 'This table is already drawing — hang tight.' };
	try {
		const event = eventId(env);
		let queued = 0;
		for (const zone of ZONES) {
			const existing = await getCurrentImage(env.DB, event, table, zone.key);
			if (!existing) continue;
			const prevPrompt = await getPromptRowById(env.DB, existing.promptId);
			const composed = prevPrompt?.composed ?? '';
			const promptId = await insertPrompt(env.DB, {
				eventId: event,
				table,
				mood: prevPrompt?.mood ?? '',
				material: prevPrompt?.material ?? '',
				programme: prevPrompt?.programme ?? '',
				feel: prevPrompt?.feel ?? '',
				wildcard: prevPrompt?.wildcard ?? undefined,
				composed,
				negative: prevPrompt?.negative ?? '',
				editedByTable: prevPrompt?.editedByTable ?? false,
				actor: 'admin',
				supersedesId: existing.promptId
			});
			const image = await insertQueuedImage(env.DB, {
				eventId: event,
				table,
				zoneKey: zone.key,
				promptId,
				prompt: composed,
				model: FAL_MODEL,
				actor: 'admin',
				supersedesId: existing.id
			});
			await requestWaitUntil(
				tickAndPersist(
					env.DB,
					{ id: image.id, state: image.state, falRequestId: image.falRequestId, table, zoneKey: zone.key },
					composed,
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
