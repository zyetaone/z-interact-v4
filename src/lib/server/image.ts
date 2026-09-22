/**
 * IMAGE — one row per generation ATTEMPT, and the compare-and-swap that
 * decides which of the three tickers may spend on it.
 *
 * Split out of `room.ts` 22 Sep. The reason to change is different from the
 * rest of the room model: everything here moves when the GENERATION STATE
 * MACHINE moves (a new state, a new provider field, a new spend rule), and
 * nothing here moves when a question or a screen changes. `room.ts`
 * re-exports every name below, so no call site had to move with it.
 *
 * The lifecycle rule that makes `image` different from `answer`/`prompt` is
 * stated in `room.ts`'s module note and still governs this file: the row for
 * ONE attempt is mutated in place as `tick()` advances its `state`; a
 * REGENERATE is a brand new row with `supersedes_id` set. Append-only across
 * regenerations, mutable within one attempt — both at once, at different
 * grain.
 */
import { dbWith, isTransientD1Error, monotonicNow, newId } from './d1';
import type { GenerationState } from './generate';

export const IMAGE_SCHEMA = `CREATE TABLE IF NOT EXISTS image (
	id TEXT PRIMARY KEY,
	event_id TEXT NOT NULL,
	table_no INTEGER NOT NULL,
	zone_key TEXT NOT NULL,
	prompt_id TEXT NOT NULL,
	r2_key TEXT,
	tile_key TEXT,
	full_key TEXT,
	model TEXT NOT NULL,
	seed INTEGER,
	reference_image_id TEXT,
	state TEXT NOT NULL,
	fal_request_id TEXT,
	error TEXT,
	actor TEXT NOT NULL,
	supersedes_id TEXT,
	created_at INTEGER NOT NULL
)`;

export const IMAGE_CURRENT_IDX = `CREATE INDEX IF NOT EXISTS image_current_idx
	ON image (event_id, table_no, zone_key, created_at DESC)`;
export const IMAGE_PENDING_IDX = `CREATE INDEX IF NOT EXISTS image_pending_idx ON image (event_id, state)`;

/* -------------------------------------------------------------------------- */
/* Image — one row per generation attempt, mutated for lifecycle, new row     */
/* on regenerate (see module note)                                            */
/* -------------------------------------------------------------------------- */

export interface ImageInsertInput {
	eventId: string;
	table: number;
	zoneKey: string;
	promptId: string;
	/** The exact per-zone text submitted to fal. Stored in `image_detail` for audit. */
	prompt: string;
	/** Absolute reference image URLs this attempt is paired with, if any. Stored alongside the prompt. */
	referenceUrls?: string[];
	model: string;
	referenceImageId?: string | null;
	actor?: 'table' | 'admin' | 'system';
	supersedesId?: string | null;
}

export interface ImageRow {
	id: string;
	eventId: string;
	table: number;
	zoneKey: string;
	promptId: string;
	r2Key: string | null;
	tileKey: string | null;
	fullKey: string | null;
	model: string;
	state: GenerationState;
	falRequestId: string | null;
	error: string | null;
	createdAt: number;
}

/** Inserts a new `queued` attempt. Also returns the prompt string for the caller's first `tick()`, since `image` doesn't store the prompt text (that's `prompt.composed`). */
export async function insertQueuedImage(d: D1Database, input: ImageInsertInput): Promise<ImageRow> {
	const db = await dbWith(d, 'image', IMAGE_SCHEMA);
	await dbWith(d, 'image_current_idx', IMAGE_CURRENT_IDX);
	await dbWith(d, 'image_pending_idx', IMAGE_PENDING_IDX);
	const id = newId();
	const createdAt = monotonicNow();
	if (db) {
		await db
			.prepare(
				`INSERT INTO image (id, event_id, table_no, zone_key, prompt_id, model, reference_image_id, state, actor, supersedes_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`
			)
			.bind(
				id,
				input.eventId,
				input.table,
				input.zoneKey,
				input.promptId,
				input.model,
				input.referenceImageId ?? null,
				input.actor ?? 'table',
				input.supersedesId ?? null,
				createdAt
			)
			.run();
	}
	return {
		id,
		eventId: input.eventId,
		table: input.table,
		zoneKey: input.zoneKey,
		promptId: input.promptId,
		r2Key: null,
		tileKey: null,
		fullKey: null,
		model: input.model,
		state: 'queued',
		falRequestId: null,
		error: null,
		createdAt
	};
}

/**
 * The CROSS-ISOLATE idempotent submit: inserts a `queued` attempt only if
 * this table+zone has no non-terminal row already, in ONE statement, and
 * returns null when it did not insert.
 *
 * `insertQueuedImage`'s callers read-then-write ("is there a current image?
 * no — insert one"), which two isolates can both pass before either writes.
 * That is the double-tap that queued two full generation sets for one
 * table. `INSERT ... SELECT ... WHERE NOT EXISTS` makes the check and the
 * write the same statement, so the database decides, not the reader.
 *
 * `sinceTs` is the table's reset watermark: a pre-reset attempt is history,
 * never a reason to refuse a fresh one.
 */
export async function insertQueuedImageIfIdle(
	d: D1Database,
	input: ImageInsertInput,
	sinceTs = 0
): Promise<ImageRow | null> {
	const db = await dbWith(d, 'image', IMAGE_SCHEMA);
	await dbWith(d, 'image_current_idx', IMAGE_CURRENT_IDX);
	await dbWith(d, 'image_pending_idx', IMAGE_PENDING_IDX);
	const id = newId();
	const createdAt = monotonicNow();
	if (!db) return null;
	const res = (await db
		.prepare(
			`INSERT INTO image (id, event_id, table_no, zone_key, prompt_id, model, reference_image_id, state, actor, supersedes_id, created_at)
                 SELECT ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?
                 WHERE NOT EXISTS (
                     SELECT 1 FROM image
                     WHERE event_id = ? AND table_no = ? AND zone_key = ?
                       AND state IN ('queued', 'requested') AND created_at > ?
                 )`
		)
		.bind(
			id,
			input.eventId,
			input.table,
			input.zoneKey,
			input.promptId,
			input.model,
			input.referenceImageId ?? null,
			input.actor ?? 'table',
			input.supersedesId ?? null,
			createdAt,
			input.eventId,
			input.table,
			input.zoneKey,
			sinceTs
		)
		.run()) as unknown as { meta?: { changes?: number } };
	if ((res?.meta?.changes ?? 0) === 0) return null;
	// The audit trail (`image_detail`): the EXACT prompt and references this
	// attempt carries. `insertQueuedImage` accepted a `prompt` argument and
	// dropped it, so an event could not be audited after the fact.
	await saveImageDetail(d, {
		imageId: id,
		eventId: input.eventId,
		table: input.table,
		zoneKey: input.zoneKey,
		prompt: input.prompt,
		referenceUrls: input.referenceUrls
	});
	return {
		id,
		eventId: input.eventId,
		table: input.table,
		zoneKey: input.zoneKey,
		promptId: input.promptId,
		r2Key: null,
		tileKey: null,
		fullKey: null,
		model: input.model,
		state: 'queued',
		falRequestId: null,
		error: null,
		createdAt
	};
}

/**
 * What one table has already spent: how many render rows it holds since its
 * last reset, and when the newest one was inserted. Both spend limits
 * (`limits.ts`) are derived from this rather than from an in-isolate timer,
 * which an isolate recycle or a second isolate would silently reset.
 */
/**
 * EVERY RENDER'S (table, createdAt) FOR THE EVENT, in ONE query.
 *
 * `getRenderBudget` above answers for one table against one watermark,
 * which is exactly right for the cap: the caller is about to spend for
 * that table and nobody else. The READOUT wants the same number for all
 * twenty at once, and each table has its OWN reset watermark, so it was
 * doing twenty sequential awaits of `getRenderBudget` — in a file whose
 * own comment worries about an invocation's ~1,000-call ceiling.
 *
 * Twenty tables at the 12-render cap is 240 rows at worst, so the counting
 * is cheaper done in the caller against whatever watermark it holds than
 * as twenty round trips with twenty different `created_at >` bounds.
 */
export async function getRenderStamps(
	d: D1Database,
	eventId: string,
	maxTable: number
): Promise<{ table: number; createdAt: number }[]> {
	const db = await dbWith(d, 'image', IMAGE_SCHEMA);
	if (!db) return [];
	const { results } = await db
		.prepare(`SELECT table_no, created_at FROM image WHERE event_id = ? AND table_no <= ?`)
		.bind(eventId, maxTable)
		.all<{ table_no: number; created_at: number }>();
	return (results ?? []).map((r) => ({ table: r.table_no, createdAt: r.created_at }));
}

export async function getRenderBudget(
	d: D1Database,
	eventId: string,
	table: number,
	sinceTs = 0
): Promise<{ used: number; lastRenderAt: number }> {
	const db = await dbWith(d, 'image', IMAGE_SCHEMA);
	if (!db) return { used: 0, lastRenderAt: 0 };
	const row = await db
		.prepare(
			// `actor <> 'restore'` is what keeps UNDO FREE. The budget counts
			// image rows, and a restore inserts one — so without this, going
			// back to a picture the table had already paid for consumed one of
			// its twelve, and two undos plus a redraw could hit the cap with
			// nothing new ever drawn. A restore makes no fal call and no new
			// bytes; the cap is about money.
			//
			// It also keeps `lastRenderAt` honest, which drives the sixty-second
			// cooldown: an undo must not start the clock on a redraw.
			`SELECT COUNT(*) as n, COALESCE(MAX(created_at), 0) as last_at
                 FROM image WHERE event_id = ? AND table_no = ? AND created_at > ?
                   AND (actor IS NULL OR actor <> 'restore')`
		)
		.bind(eventId, table, sinceTs)
		.first<{ n: number; last_at: number }>();
	return { used: row?.n ?? 0, lastRenderAt: row?.last_at ?? 0 };
}

interface ImageRawRow {
	id: string;
	event_id: string;
	table_no: number;
	zone_key: string;
	prompt_id: string;
	r2_key: string | null;
	tile_key: string | null;
	full_key: string | null;
	model: string;
	state: string;
	fal_request_id: string | null;
	error: string | null;
	created_at: number;
}

function toImageRow(r: ImageRawRow): ImageRow {
	return {
		id: r.id,
		eventId: r.event_id,
		table: r.table_no,
		zoneKey: r.zone_key,
		promptId: r.prompt_id,
		r2Key: r.r2_key,
		tileKey: r.tile_key,
		fullKey: r.full_key,
		model: r.model,
		state: r.state as GenerationState,
		falRequestId: r.fal_request_id,
		error: r.error,
		createdAt: r.created_at
	};
}

/** The current (latest, not-superseded-by-a-newer-attempt) image row for one table+zone, or null if none has been queued yet. */
export async function getCurrentImage(
	d: D1Database,
	eventId: string,
	table: number,
	zoneKey: string
): Promise<ImageRow | null> {
	const db = await dbWith(d, 'image', IMAGE_SCHEMA);
	if (!db) return null;
	const row = await db
		.prepare(
			`SELECT id, event_id, table_no, zone_key, prompt_id, r2_key, tile_key, full_key, model, state, fal_request_id, error, created_at
             FROM image WHERE event_id = ? AND table_no = ? AND zone_key = ?
             ORDER BY created_at DESC LIMIT 1`
		)
		.bind(eventId, table, zoneKey)
		.first<ImageRawRow>();
	return row ? toImageRow(row) : null;
}

/** Every non-terminal (queued/requested) image row for a table — what a phone-poll ticker walks. */
export async function getPendingImagesForTable(d: D1Database, eventId: string, table: number): Promise<ImageRow[]> {
	const db = await dbWith(d, 'image', IMAGE_SCHEMA);
	if (!db) return [];
	const { results } = await db
		.prepare(
			`SELECT id, event_id, table_no, zone_key, prompt_id, r2_key, tile_key, full_key, model, state, fal_request_id, error, created_at
             FROM image WHERE event_id = ? AND table_no = ? AND state IN ('queued', 'requested')`
		)
		.bind(eventId, table)
		.all<ImageRawRow>();
	return (results ?? []).map(toImageRow);
}

/** Every non-terminal image row for the whole event — what the admin poll's ticker walks. */
export async function getPendingImagesForEvent(d: D1Database, eventId: string): Promise<ImageRow[]> {
	const db = await dbWith(d, 'image', IMAGE_SCHEMA);
	if (!db) return [];
	const { results } = await db
		.prepare(
			`SELECT id, event_id, table_no, zone_key, prompt_id, r2_key, tile_key, full_key, model, state, fal_request_id, error, created_at
             FROM image WHERE event_id = ? AND state IN ('queued', 'requested')`
		)
		.bind(eventId)
		.all<ImageRawRow>();
	return (results ?? []).map(toImageRow);
}

export async function getImageById(d: D1Database, id: string): Promise<ImageRow | null> {
	const db = await dbWith(d, 'image', IMAGE_SCHEMA);
	if (!db) return null;
	const row = await db
		.prepare(
			`SELECT id, event_id, table_no, zone_key, prompt_id, r2_key, tile_key, full_key, model, state, fal_request_id, error, created_at
             FROM image WHERE id = ?`
		)
		.bind(id)
		.first<ImageRawRow>();
	return row ? toImageRow(row) : null;
}

/* -------------------------------------------------------------------------- */
/* IMAGE DETAIL — the audit trail and the retry counter.                      */
/*                                                                            */
/* A SIDECAR TABLE, not new columns on `image`. `d1.ts` is explicit: there is */
/* no migration runner, adding a column to an existing table is a silent      */
/* no-op locally and throws on the first insert in production, and a new      */
/* TABLE is the only safe schema change this layer supports.                  */
/*                                                                            */
/* It holds what the fidelity run showed missing: the EXACT prompt each zone  */
/* was submitted with (`insertQueuedImage` accepted a `prompt` argument and   */
/* then dropped it on the floor, so an event could not be audited after the   */
/* fact), the reference image URLs that prompt was paired with, and how many  */
/* times this row has been submitted — which is what bounds the retry below.  */
/* -------------------------------------------------------------------------- */

export const IMAGE_DETAIL_SCHEMA = `CREATE TABLE IF NOT EXISTS image_detail (
	image_id TEXT PRIMARY KEY,
	event_id TEXT NOT NULL,
	table_no INTEGER NOT NULL,
	zone_key TEXT NOT NULL,
	prompt TEXT NOT NULL,
	reference_urls TEXT,
	attempt INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL
)`;

export interface ImageDetail {
	prompt: string;
	referenceUrls: string[];
	/** Submits so far. 1 after the first, 2 after the single automatic retry. */
	attempt: number;
}

/** Records the exact prompt and references one attempt was submitted with. Never overwritten — a retry bumps `attempt`, it does not rewrite history. */
export async function saveImageDetail(
	d: D1Database,
	input: { imageId: string; eventId: string; table: number; zoneKey: string; prompt: string; referenceUrls?: string[] }
): Promise<void> {
	const db = await dbWith(d, 'image_detail', IMAGE_DETAIL_SCHEMA);
	if (!db) return;
	try {
		await db
			.prepare(
				`INSERT INTO image_detail (image_id, event_id, table_no, zone_key, prompt, reference_urls, attempt, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, 1, ?)
                 ON CONFLICT(image_id) DO NOTHING`
			)
			.bind(
				input.imageId,
				input.eventId,
				input.table,
				input.zoneKey,
				input.prompt,
				input.referenceUrls?.length ? JSON.stringify(input.referenceUrls) : null,
				monotonicNow()
			)
			.run();
	} catch (e) {
		if (isTransientD1Error(e)) return;
		throw e;
	}
}

/** Records the references an attempt was ACTUALLY submitted with. The planned set is written at insert; the anchor zone's URL is only known at submit time. */
export async function setImageReferences(d: D1Database, imageId: string, urls: readonly string[]): Promise<void> {
	const db = await dbWith(d, 'image_detail', IMAGE_DETAIL_SCHEMA);
	if (!db) return;
	try {
		await db
			.prepare(`UPDATE image_detail SET reference_urls = ? WHERE image_id = ?`)
			.bind(urls.length ? JSON.stringify([...urls]) : null, imageId)
			.run();
	} catch (e) {
		if (isTransientD1Error(e)) return;
		throw e;
	}
}

export async function getImageDetail(d: D1Database, imageId: string): Promise<ImageDetail | null> {
	const db = await dbWith(d, 'image_detail', IMAGE_DETAIL_SCHEMA);
	if (!db) return null;
	const row = await db
		.prepare(`SELECT prompt, reference_urls, attempt FROM image_detail WHERE image_id = ?`)
		.bind(imageId)
		.first<{ prompt: string; reference_urls: string | null; attempt: number }>();
	if (!row) return null;
	let referenceUrls: string[] = [];
	try {
		const parsed = row.reference_urls ? (JSON.parse(row.reference_urls) as unknown) : [];
		if (Array.isArray(parsed)) referenceUrls = parsed.filter((u): u is string => typeof u === 'string');
	} catch {
		/* a malformed column reads as "no references", not as a thrown tick */
	}
	return { prompt: row.prompt, referenceUrls, attempt: row.attempt };
}

/**
 * ONE automatic retry, then give up. Four of twelve requests in the fidelity
 * run failed with an opaque 422 — table 3's whole set, moments after table 2
 * succeeded 4/4 — which reads as a provider wobble rather than a bad prompt.
 *
 * The retry is a state-machine move, not a second code path: the row goes
 * back to `queued` with its fal request id cleared, and the next ticker
 * claims it and submits fresh. Guarded on `attempt`, so a row that keeps
 * failing fails visibly instead of billing forever.
 */
export async function retryImage(d: D1Database, id: string, maxAttempts = 2): Promise<boolean> {
	const db = await dbWith(d, 'image_detail', IMAGE_DETAIL_SCHEMA);
	if (!db) return false;
	const bumped = (await db
		.prepare(`UPDATE image_detail SET attempt = attempt + 1 WHERE image_id = ? AND attempt < ?`)
		.bind(id, maxAttempts)
		.run()) as unknown as { meta?: { changes?: number } };
	if ((bumped?.meta?.changes ?? 0) === 0) return false;
	// Only a row still mid-flight goes back in the queue — a row some other
	// ticker has since carried to `stored` must not be re-submitted.
	return swap(d, `UPDATE image SET state = 'queued', fal_request_id = NULL WHERE id = ? AND state IN ('queued', 'requested')`, [
		id
	]);
}

/* -------------------------------------------------------------------------- */
/* STATE TRANSITIONS ARE COMPARE-AND-SWAP                                     */
/*                                                                            */
/* Three tickers (phone poll, admin poll, fal webhook) run on independent     */
/* clocks in independent isolates and each decides from a snapshot its own    */
/* caller read. A bare `WHERE id = ?` let two of them both read a row as      */
/* `queued` and both submit it to fal — two paid jobs, and whichever          */
/* `markRequested` landed last silently dropped the other's request id.       */
/*                                                                            */
/* Every write below is `... WHERE id = ? AND state = <the state we decided   */
/* from>` and returns whether it changed a row. Zero changes means another    */
/* ticker got there first, and the caller stops rather than acting on a       */
/* decision that is no longer true. `changes` is D1's own result field, and   */
/* `fake-d1.ts` surfaces the same one from SQLite.                            */
/* -------------------------------------------------------------------------- */

/** True when the UPDATE actually changed a row. A D1 wobble reads as "did not win" rather than throwing — the next poll retries. */
async function swap(d: D1Database, sql: string, binds: unknown[]): Promise<boolean> {
	const db = await dbWith(d, 'image', IMAGE_SCHEMA);
	if (!db) return false;
	try {
		const res = (await db
			.prepare(sql)
			.bind(...binds)
			.run()) as unknown as { meta?: { changes?: number } };
		return (res?.meta?.changes ?? 0) > 0;
	} catch (e) {
		if (isTransientD1Error(e)) return false;
		throw e;
	}
}

/**
 * CLAIM the row before spending money on it: `queued -> requested`, with the
 * fal request id still null. The winner is whoever's UPDATE changes the row;
 * every other ticker gets `false` and stops before calling fal at all.
 *
 * Claiming BEFORE the submit, rather than swapping after it, is the whole
 * point. A compare-and-swap on the way back would still have let both
 * tickers submit; it would only have decided whose request id survived.
 */
export async function claimQueued(d: D1Database, id: string): Promise<boolean> {
	return swap(d, `UPDATE image SET state = 'requested' WHERE id = ? AND state = 'queued'`, [id]);
}

/** Records the fal request id against a row this ticker already claimed. Guarded so a late duplicate cannot overwrite a live id. */
export async function markRequested(d: D1Database, id: string, falRequestId: string): Promise<boolean> {
	return swap(
		d,
		`UPDATE image SET state = 'requested', fal_request_id = ? WHERE id = ? AND state = 'requested' AND fal_request_id IS NULL`,
		[falRequestId, id]
	);
}

/** `tick()`'s `requested -> stored` transition. The R2 key derives from the image row id, so a losing ticker's duplicate put wrote identical bytes to the same key — only the D1 write needed guarding. */
export async function markStored(d: D1Database, id: string, r2Key: string): Promise<boolean> {
	return swap(d, `UPDATE image SET state = 'stored', r2_key = ? WHERE id = ? AND state = 'requested'`, [r2Key, id]);
}

/** Any non-terminal state -> `failed`. Guarded so a slow failure report cannot overwrite a render that has since succeeded. */
export async function markFailed(d: D1Database, id: string, error: string): Promise<boolean> {
	return swap(d, `UPDATE image SET state = 'failed', error = ? WHERE id = ? AND state IN ('queued', 'requested')`, [
		error.slice(0, 500),
		id
	]);
}
