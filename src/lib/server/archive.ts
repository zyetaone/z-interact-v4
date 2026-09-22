/**
 * ARCHIVE — what happens to a room BETWEEN events: read it out, hand it
 * back, wipe it, put a render back.
 *
 * Split out of `room.ts` 22 Sep. One reason to change: the lifecycle of a
 * reused database. `exportRoomRows` is the shape the archive and the desk's
 * Export both take; `resetRoom` hands twenty tables their allowance back
 * without deleting a row; `clearRoom` is the only DELETE in this codebase;
 * `findRestorable`/`restoreImages` are the phone's Undo, which is an INSERT
 * pointing at an earlier `r2_key` rather than a rollback.
 *
 * It sits DOWNSTREAM of `room.ts` and `image.ts` and neither imports it, so
 * the destructive verbs cannot be reached from the read paths by accident.
 * `room.ts` re-exports these names.
 */
import { dbWith, monotonicNow, newId } from './d1';
import type { GenerationState } from './generate';
import {
	EVENT_TABLE_SCHEMA,
	getCurrentAnswersSince,
	getCurrentImageSince,
	getPromptRowById,
	getResetAt,
	getTableFutures,
	resetTable,
	type AnswerRow,
	type PromptRow
} from './room';
import { IMAGE_SCHEMA, getImageDetail } from './image';
import { setBeat } from './beat';
import { setLocked } from './gate';

/* -------------------------------------------------------------------------- */
/* Export — one JSON per table, taken before any destructive verb            */
/* (game-flow.md §5). Point reads, not batched: export is a rare admin       */
/* action, not the 3s poll (`getAdminRoomRows` above is what stays batched). */
/* `zoneKeys` is passed in rather than imported — this file stays content-   */
/* free, per its own module note; the caller (admin.remote.ts) supplies      */
/* `ZONES.map(z => z.key)`.                                                  */
/* -------------------------------------------------------------------------- */

export interface ExportTableRow {
	table: number;
	futureKey: string | null;
	submittedAt: number | null;
	resetAt: number;
	answers: AnswerRow[];
	/**
	 * A failed render has to be DIAGNOSABLE from the export alone — that is
	 * the whole reason the export is taken. It carries the row's id, the
	 * zone it was for, the provider's own error text as captured at the
	 * point of failure, and the sidecar's record of the exact prompt and
	 * reference URLs that attempt was submitted with.
	 */
	images: {
		id: string;
		zoneKey: string;
		/** Duplicate of `zoneKey`. Readers in the wild have been seen looking for `zone`, and an export that reports `null` for the one field a failure is filed under is worse than a redundant key. */
		zone: string;
		r2Key: string | null;
		state: GenerationState;
		error: string | null;
		falRequestId: string | null;
		createdAt: number;
		/** The exact text submitted for THIS zone, not the table-level composition. */
		submittedPrompt: string | null;
		referenceUrls: string[];
		/** Submits so far: 1 after the first, 2 after the single automatic retry. */
		attempt: number | null;
		prompt: PromptRow | null;
	}[];
}

export async function exportRoomRows(d: D1Database, eventId: string, tableCount: number, zoneKeys: readonly string[]): Promise<ExportTableRow[]> {
	const etDb = await dbWith(d, 'event_table', EVENT_TABLE_SCHEMA);
	// One batched read for every table's future — see `getTableFutures`'s
	// module note on why this reads `answer`, not `event_table.future_key`.
	const futures = await getTableFutures(d, eventId);
	const rows: ExportTableRow[] = [];
	for (let t = 1; t <= tableCount; t++) {
		const since = await getResetAt(d, eventId, t);
		const answers = await getCurrentAnswersSince(d, eventId, t, since);
		const et = etDb
			? await etDb
					.prepare(`SELECT submitted_at FROM event_table WHERE event_id = ? AND table_no = ?`)
					.bind(eventId, t)
					.first<{ submitted_at: number | null }>()
			: null;
		const images: ExportTableRow['images'] = [];
		for (const zoneKey of zoneKeys) {
			const img = await getCurrentImageSince(d, eventId, t, zoneKey, since);
			if (!img) continue;
			const detail = await getImageDetail(d, img.id);
			images.push({
				id: img.id,
				zoneKey,
				zone: zoneKey,
				r2Key: img.r2Key,
				state: img.state,
				error: img.error,
				falRequestId: img.falRequestId,
				createdAt: img.createdAt,
				submittedPrompt: detail?.prompt ?? null,
				referenceUrls: detail?.referenceUrls ?? [],
				attempt: detail?.attempt ?? null,
				prompt: await getPromptRowById(d, img.promptId)
			});
		}
		rows.push({
			table: t,
			futureKey: futures.get(t) ?? null,
			submittedAt: et?.submitted_at ?? null,
			resetAt: since,
			answers,
			images
		});
	}
	return rows;
}

/**
 * THE TWO ROOM-WIDE VERBS game-flow.md §5 asked for and this app never had
 * ("delete one table / clear the room"). They are deliberately not the same
 * verb, because they are not the same risk.
 *
 * `resetRoom` is twenty `resetTable` calls: a watermark per table, nothing
 * deleted, every row still in D1 and still in the export. It is what a dry
 * run wants — rehearse the whole room, then hand it back to the real tables
 * with their allowance restored.
 *
 * `clearRoom` is a DELETE, and the only one in this codebase. It is what a
 * new event on a reused database wants. It cannot be undone, `wrangler d1
 * export` before it is the whole safety net, and the caller has to say the
 * event id back for it to run at all — see the route.
 */
export async function resetRoom(d: D1Database, eventId: string, tableCount: number): Promise<number> {
	for (let table = 1; table <= tableCount; table++) {
		await resetTable(d, eventId, table, 'admin');
	}
	// The two things a per-table watermark cannot reach, and the reason this
	// is not just a loop over `resetTable`.
	//
	// Found 22 Sep by auditing the verb against its own promise. `resetRoom`
	// says "hand the room back for another run"; the lock and the beat are
	// room-wide and neither moved. A facilitator who closed the room at the
	// end of run one — which is exactly what the desk's Close button is for —
	// then pressed Reset all and handed out the cards again would have had
	// twenty phones refused with "the room is closed", and the wall still
	// showing the finale of a room that no longer has any answers in it. The
	// data was right everywhere; the room was not usable.
	await setLocked(d, eventId, false);
	await setBeat(d, eventId, 'lobby', null);
	return tableCount;
}

export type ClearedCounts = {
	answer: number;
	prompt: number;
	image: number;
	narrative: number;
	table_reset: number;
	/** The gate's own rows. Left behind until 22 Sep, so a cleared database still remembered a lock, a reopen grant and a beat from the previous event. */
	room_state: number;
	table_reopen: number;
	room_beat: number;
};

/**
 * Deletes every row this event owns, and reports what went. R2 objects are
 * NOT touched: they are keyed by image row id, so once the rows are gone
 * nothing in the app can name them again — they are orphaned, not served.
 *
 * ponytail: orphaned objects cost storage and nothing else. Sweeping them
 * needs a list-and-delete over the bucket prefix, which is a second failure
 * mode (a half-finished sweep) for a bill measured in cents. Add it when a
 * bucket is actually reused across many events.
 */
export async function clearRoom(d: D1Database, eventId: string): Promise<ClearedCounts> {
	const out: ClearedCounts = {
		answer: 0,
		prompt: 0,
		image: 0,
		narrative: 0,
		table_reset: 0,
		room_state: 0,
		table_reopen: 0,
		room_beat: 0
	};
	for (const table of Object.keys(out) as (keyof ClearedCounts)[]) {
		// Every one of these tables is created by `ensureTable` on first use,
		// so on a fresh database some of them genuinely do not exist yet.
		// A missing table is nothing to delete, not an error.
		try {
			const res = await d.prepare(`DELETE FROM ${table} WHERE event_id = ?`).bind(eventId).run();
			out[table] = res.meta?.changes ?? 0;
		} catch {
			out[table] = 0;
		}
	}
	try {
		await d.prepare(`UPDATE event_table SET submitted_at = NULL WHERE event_id = ?`).bind(eventId).run();
	} catch {
		/* same reasoning */
	}
	return out;
}

export type StoredImageRow = { id: string; table: number; zoneKey: string; r2Key: string; createdAt: number };

/**
 * Every render this event ever stored, oldest first — for the desk's
 * "save the photographs" page.
 *
 * DELIBERATELY IGNORES THE RESET WATERMARK, which every other read here
 * honours. A watermark means "the room should stop showing this"; it does
 * not mean the picture never happened. A table that redrew four times made
 * four pictures and the one you want to keep is as likely to be an earlier
 * one. This is the archive path, not a room read.
 */
export async function listStoredImages(d: D1Database, eventId: string): Promise<StoredImageRow[]> {
	const db = await dbWith(d, 'image', IMAGE_SCHEMA);
	if (!db) return [];
	const res = await db
		.prepare(
			`SELECT id, table_no, zone_key, r2_key, created_at FROM image
			 WHERE event_id = ? AND r2_key IS NOT NULL AND r2_key != ''
			 ORDER BY table_no ASC, created_at ASC`
		)
		.bind(eventId)
		.all<{ id: string; table_no: number; zone_key: string; r2_key: string; created_at: number }>();
	return (res.results ?? []).map((r) => ({
		id: r.id,
		table: r.table_no,
		zoneKey: r.zone_key,
		r2Key: r.r2_key,
		createdAt: r.created_at
	}));
}

/**
 * UNDO, on an append-only table.
 *
 * v1 had one and it was a client-side swap of two URLs in a store: real
 * enough to a table, gone on a reload, and invisible to the wall. Here it
 * does not have to be. `image` is append-only ACROSS regenerations, so
 * every earlier render is still a row and its bytes are still in R2 — the
 * only reason a table cannot see its previous picture is that "current"
 * means "newest row for this zone".
 *
 * So restoring is an INSERT, not an update and certainly not a delete: a
 * new `stored` row pointing at the earlier object, superseding the one on
 * screen. Nothing is rewritten, the history keeps growing in one direction,
 * and `/admin/photos` still lists every picture that ever existed.
 *
 * IT SPENDS NOTHING. No fal call, no new bytes in R2, and it does not count
 * against `MAX_RENDERS_PER_TABLE` — the cap is about money, and going back
 * to a picture you already paid for costs none.
 *
 * Pressing it twice returns you to where you were, which is exactly how
 * v1's toggle behaved: the row you just left is now the newest DIFFERENT
 * key, so it becomes the thing to go back to.
 */
export type RestorableImage = { zoneKey: string; currentId: string; r2Key: string; promptId: string; model: string };

export async function findRestorable(
	d: D1Database,
	eventId: string,
	table: number,
	zoneKeys: readonly string[],
	sinceTs = 0
): Promise<RestorableImage[]> {
	const db = await dbWith(d, 'image', IMAGE_SCHEMA);
	if (!db) return [];
	const out: RestorableImage[] = [];
	for (const zoneKey of zoneKeys) {
		const res = await db
			.prepare(
				`SELECT id, r2_key, prompt_id, model FROM image
				 WHERE event_id = ? AND table_no = ? AND zone_key = ? AND state = 'stored'
				   AND r2_key IS NOT NULL AND r2_key != '' AND created_at > ?
				 ORDER BY created_at DESC LIMIT 2`
			)
			.bind(eventId, table, zoneKey, sinceTs)
			.all<{ id: string; r2_key: string; prompt_id: string; model: string }>();
		const rows = res.results ?? [];
		// Two rows with the SAME key is what a previous restore looks like —
		// there is nothing to go back to that is not already on screen.
		const prev = rows.find((r) => r.r2_key !== rows[0]?.r2_key);
		if (rows[0] && prev) {
			out.push({ zoneKey, currentId: rows[0].id, r2Key: prev.r2_key, promptId: prev.prompt_id, model: prev.model });
		}
	}
	return out;
}

export async function restoreImages(d: D1Database, eventId: string, table: number, items: readonly RestorableImage[]): Promise<number> {
	const db = await dbWith(d, 'image', IMAGE_SCHEMA);
	if (!db) return 0;
	let n = 0;
	for (const item of items) {
		await db
			.prepare(
				`INSERT INTO image (id, event_id, table_no, zone_key, prompt_id, model, state, r2_key, actor, supersedes_id, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, 'stored', ?, 'restore', ?, ?)`
			)
			.bind(newId(), eventId, table, item.zoneKey, item.promptId, item.model, item.r2Key, item.currentId, monotonicNow())
			.run();
		n++;
	}
	return n;
}
