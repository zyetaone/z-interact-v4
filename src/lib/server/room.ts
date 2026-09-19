/**
 * ROOM MODEL — event tables, answers, prompts and generation rows.
 *
 * Table names and columns are taken from the game-flow design's
 * `schema.draft.ts` where it already defines them (`event_table`, `answer`,
 * `prompt`, `image`) — structure only, never its content (futures,
 * questions, zones stay TODO(content) in `src/lib/game/`). Scoped down from
 * that draft's 13 tables to the four this plumbing task needs; `clip`,
 * `transcript`, `extraction`, `minutes`, `sequence`, `vote`, `event` and
 * `admin_log` are not created here — they belong to listen-mode, the vote
 * phase, and admin logging, none of which are in scope yet.
 *
 * **Nothing is updated in place for `answer` and `prompt`.** Both are
 * append-only: an edit is a new row with `actor`/`source` and a
 * `supersedes_id` pointing at the row it sits above; "current" is the
 * newest row for its natural key. `currentAnswers()` is the one place that
 * resolution rule lives.
 *
 * **`image` is different**: the row for one generation ATTEMPT is mutated
 * in place as `generate.ts`'s `tick()` advances its `state` machine
 * (queued -> requested -> stored -> done/failed) — that is the same
 * attempt progressing, not a content edit. A *regenerate* is what creates a
 * brand new `image` row, with `supersedes_id` pointing at the attempt it
 * replaces, `state: 'queued'` again. So `image` is append-only across
 * regenerations and mutable within one attempt's lifecycle — both rules
 * hold at once, at different grain.
 */
import { dbWith, isTransientD1Error } from './d1';
import type { GenerationState } from './generate';

export const EVENT_TABLE_SCHEMA = `CREATE TABLE IF NOT EXISTS event_table (
	id TEXT PRIMARY KEY,
	event_id TEXT NOT NULL,
	table_no INTEGER NOT NULL,
	future_key TEXT,
	era TEXT,
	mode TEXT NOT NULL DEFAULT 'tap',
	submitted_at INTEGER,
	last_seen_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	UNIQUE (event_id, table_no)
)`;

export const ANSWER_SCHEMA = `CREATE TABLE IF NOT EXISTS answer (
	id TEXT PRIMARY KEY,
	event_id TEXT NOT NULL,
	table_no INTEGER NOT NULL,
	question_id TEXT NOT NULL,
	keys TEXT NOT NULL,
	text TEXT,
	push_reply TEXT,
	actor TEXT NOT NULL,
	source TEXT NOT NULL,
	supersedes_id TEXT,
	created_at INTEGER NOT NULL
)`;

export const ANSWER_CURRENT_IDX = `CREATE INDEX IF NOT EXISTS answer_current_idx
	ON answer (event_id, table_no, question_id, created_at DESC)`;

export const PROMPT_SCHEMA = `CREATE TABLE IF NOT EXISTS prompt (
	id TEXT PRIMARY KEY,
	event_id TEXT NOT NULL,
	table_no INTEGER NOT NULL,
	mood TEXT NOT NULL,
	material TEXT NOT NULL,
	programme TEXT NOT NULL,
	feel TEXT NOT NULL,
	wildcard TEXT,
	composed TEXT NOT NULL,
	negative TEXT NOT NULL DEFAULT '',
	edited_by_table INTEGER NOT NULL DEFAULT 0,
	actor TEXT NOT NULL,
	supersedes_id TEXT,
	created_at INTEGER NOT NULL
)`;

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

function newId(): string {
	return crypto.randomUUID();
}

/* -------------------------------------------------------------------------- */
/* Answers — append-only, latest wins                                         */
/* -------------------------------------------------------------------------- */

export interface AnswerInput {
	eventId: string;
	table: number;
	questionId: string;
	keys: string[];
	text?: Record<string, string>;
	pushReply?: string;
	actor?: 'table' | 'admin' | 'system';
	source?: 'tap' | 'listen' | 'admin' | 'seed';
	supersedesId?: string | null;
}

export interface AnswerRow {
	id: string;
	questionId: string;
	keys: string[];
	text?: Record<string, string>;
	pushReply?: string;
	actor: string;
	source: string;
	supersedesId: string | null;
	createdAt: number;
}

/** Per-screen save — not one form post. Always an INSERT, never an UPDATE. */
export async function saveAnswer(d: D1Database, input: AnswerInput): Promise<void> {
	const db = await dbWith(d, 'answer', ANSWER_SCHEMA);
	if (!db) return;
	await dbWith(d, 'answer_current_idx', ANSWER_CURRENT_IDX);
	try {
		await db
			.prepare(
				`INSERT INTO answer (id, event_id, table_no, question_id, keys, text, push_reply, actor, source, supersedes_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				newId(),
				input.eventId,
				input.table,
				input.questionId,
				JSON.stringify(input.keys),
				input.text ? JSON.stringify(input.text) : null,
				input.pushReply ?? null,
				input.actor ?? 'table',
				input.source ?? 'tap',
				input.supersedesId ?? null,
				Date.now()
			)
			.run();
	} catch (e) {
		if (isTransientD1Error(e)) return;
		throw e;
	}
}

interface AnswerRawRow {
	id: string;
	question_id: string;
	keys: string;
	text: string | null;
	push_reply: string | null;
	actor: string;
	source: string;
	supersedes_id: string | null;
	created_at: number;
}

/** Decodes JSON columns, dropping rows that fail to parse rather than throwing (a stale option key is dropped, not thrown). Does not resolve "latest wins" — see `currentAnswers`. */
export function rowToAnswers(rows: AnswerRawRow[]): AnswerRow[] {
	const out: AnswerRow[] = [];
	for (const row of rows) {
		try {
			const keys = JSON.parse(row.keys) as unknown;
			if (!Array.isArray(keys) || !keys.every((k) => typeof k === 'string')) continue;
			out.push({
				id: row.id,
				questionId: row.question_id,
				keys,
				text: row.text ? (JSON.parse(row.text) as Record<string, string>) : undefined,
				pushReply: row.push_reply ?? undefined,
				actor: row.actor,
				source: row.source,
				supersedesId: row.supersedes_id,
				createdAt: row.created_at
			});
		} catch {
			continue;
		}
	}
	return out;
}

/** Latest-revision-wins, the one resolution rule the whole append-only design rests on. */
export function currentAnswers(rows: readonly AnswerRow[]): Map<string, AnswerRow> {
	const out = new Map<string, AnswerRow>();
	for (const r of rows) {
		const held = out.get(r.questionId);
		if (!held || r.createdAt > held.createdAt) out.set(r.questionId, r);
	}
	return out;
}

/** All answer history for a table, resolved to the latest row per question. */
export async function getCurrentAnswers(d: D1Database, eventId: string, table: number): Promise<AnswerRow[]> {
	const db = await dbWith(d, 'answer', ANSWER_SCHEMA);
	if (!db) return [];
	const { results } = await db
		.prepare(
			`SELECT id, question_id, keys, text, push_reply, actor, source, supersedes_id, created_at
             FROM answer WHERE event_id = ? AND table_no = ?`
		)
		.bind(eventId, table)
		.all<AnswerRawRow>();
	return [...currentAnswers(rowToAnswers(results ?? [])).values()];
}

/* -------------------------------------------------------------------------- */
/* event_table — one row per table, mutated for lifecycle fields only         */
/* -------------------------------------------------------------------------- */

export interface TableState {
	table: number;
	currentStep: number;
	submittedAt: number | null;
}

async function ensureTableRow(db: D1Database, eventId: string, table: number): Promise<void> {
	await db
		.prepare(
			`INSERT INTO event_table (id, event_id, table_no, mode, last_seen_at, created_at)
             VALUES (?, ?, ?, 'tap', ?, ?)
             ON CONFLICT(event_id, table_no) DO UPDATE SET last_seen_at = excluded.last_seen_at`
		)
		.bind(newId(), eventId, table, Date.now(), Date.now())
		.run();
}

/**
 * `currentStep` is derived from the answer count, not stored — `event_table`
 * has no `current_step` column in the schema.draft.ts shape (step is a
 * client/UI concept; the server truth is "how many questions have a current
 * answer"). TODO(content): once QUESTIONS is real, replace the raw answer
 * count with the actual step index (some answers may be for skipped/void
 * question ids during a resume).
 */
export async function getTableState(d: D1Database, eventId: string, table: number): Promise<TableState> {
	const db = await dbWith(d, 'event_table', EVENT_TABLE_SCHEMA);
	if (!db) return { table, currentStep: 0, submittedAt: null };
	await ensureTableRow(db, eventId, table);
	const row = await db
		.prepare(`SELECT submitted_at FROM event_table WHERE event_id = ? AND table_no = ?`)
		.bind(eventId, table)
		.first<{ submitted_at: number | null }>();
	const answers = await getCurrentAnswers(d, eventId, table);
	return { table, currentStep: answers.length, submittedAt: row?.submitted_at ?? null };
}

/** Marks a table submitted. Idempotent to call again — repeated submits are what the gate's `assertCanSubmit` already blocks upstream. */
export async function finishTable(d: D1Database, eventId: string, table: number): Promise<TableState> {
	const db = await dbWith(d, 'event_table', EVENT_TABLE_SCHEMA);
	if (!db) return { table, currentStep: 0, submittedAt: null };
	await ensureTableRow(db, eventId, table);
	await db
		.prepare(`UPDATE event_table SET submitted_at = ? WHERE event_id = ? AND table_no = ?`)
		.bind(Date.now(), eventId, table)
		.run();
	return getTableState(d, eventId, table);
}

export interface RoomSnapshot {
	tables: TableState[];
}

/** Full room snapshot for the projector poll. */
export async function getRoom(d: D1Database, eventId: string, tableCount: number): Promise<RoomSnapshot> {
	const db = await dbWith(d, 'event_table', EVENT_TABLE_SCHEMA);
	if (!db) return { tables: [] };
	const { results } = await db
		.prepare(`SELECT table_no, submitted_at FROM event_table WHERE event_id = ?`)
		.bind(eventId)
		.all<{ table_no: number; submitted_at: number | null }>();
	const byTable = new Map((results ?? []).map((r) => [r.table_no, r]));
	const tables: TableState[] = [];
	for (let t = 1; t <= tableCount; t++) {
		const row = byTable.get(t);
		tables.push({ table: t, currentStep: 0, submittedAt: row?.submitted_at ?? null });
	}
	return { tables };
}

/* -------------------------------------------------------------------------- */
/* Prompt — append-only, four layers + composed + negative                    */
/* -------------------------------------------------------------------------- */

export interface PromptInput {
	eventId: string;
	table: number;
	mood: string;
	material: string;
	programme: string;
	feel: string;
	wildcard?: string;
	composed: string;
	negative?: string;
	editedByTable?: boolean;
	actor?: 'table' | 'admin' | 'system';
	supersedesId?: string | null;
}

export async function insertPrompt(d: D1Database, input: PromptInput): Promise<string> {
	const db = await dbWith(d, 'prompt', PROMPT_SCHEMA);
	const id = newId();
	if (!db) return id;
	await db
		.prepare(
			`INSERT INTO prompt (id, event_id, table_no, mood, material, programme, feel, wildcard, composed, negative, edited_by_table, actor, supersedes_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id,
			input.eventId,
			input.table,
			input.mood,
			input.material,
			input.programme,
			input.feel,
			input.wildcard ?? null,
			input.composed,
			input.negative ?? '',
			input.editedByTable ? 1 : 0,
			input.actor ?? 'table',
			input.supersedesId ?? null,
			Date.now()
		)
		.run();
	return id;
}

/* -------------------------------------------------------------------------- */
/* Image — one row per generation attempt, mutated for lifecycle, new row     */
/* on regenerate (see module note)                                            */
/* -------------------------------------------------------------------------- */

export interface ImageInsertInput {
	eventId: string;
	table: number;
	zoneKey: string;
	promptId: string;
	prompt: string;
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
	const createdAt = Date.now();
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

/** `tick()`'s `queued -> requested` transition, written back in place (same attempt, not a new row). */
export async function markRequested(d: D1Database, id: string, falRequestId: string): Promise<void> {
	const db = await dbWith(d, 'image', IMAGE_SCHEMA);
	if (!db) return;
	await db.prepare(`UPDATE image SET state = 'requested', fal_request_id = ? WHERE id = ?`).bind(falRequestId, id).run();
}

/** `tick()`'s `requested -> stored` transition. */
export async function markStored(d: D1Database, id: string, r2Key: string): Promise<void> {
	const db = await dbWith(d, 'image', IMAGE_SCHEMA);
	if (!db) return;
	await db.prepare(`UPDATE image SET state = 'stored', r2_key = ? WHERE id = ?`).bind(r2Key, id).run();
}

/** Any transition -> `failed`. Called by a caller that catches a `tick()` dependency throwing, so a transient wobble doesn't wedge the row forever without a record of why. */
export async function markFailed(d: D1Database, id: string, error: string): Promise<void> {
	const db = await dbWith(d, 'image', IMAGE_SCHEMA);
	if (!db) return;
	try {
		await db.prepare(`UPDATE image SET state = 'failed', error = ? WHERE id = ?`).bind(error.slice(0, 500), id).run();
	} catch (e) {
		if (isTransientD1Error(e)) return;
		throw e;
	}
}

/* -------------------------------------------------------------------------- */
/* Admin additions — everything below is ADDITIVE (admin.remote.ts's         */
/* workstream). No existing export above this line is changed: `insertPrompt`*/
/* still returns just an id, `getCurrentImage`/`insertQueuedImage` keep their*/
/* signatures, `answers.remote.ts`/`generate.ts`/`ticker.ts` are untouched.  */
/* -------------------------------------------------------------------------- */

/** Reads back one prompt row in full — `insertPrompt` only returns an id, and nothing else in this file reads a prompt row back. Admin's regenerate (copy the layers forward into a new row) and export (report them) both need it. */
export interface PromptRow {
	id: string;
	mood: string;
	material: string;
	programme: string;
	feel: string;
	wildcard: string | null;
	composed: string;
	negative: string;
	editedByTable: boolean;
	actor: string;
	createdAt: number;
}

interface PromptRawRow {
	id: string;
	mood: string;
	material: string;
	programme: string;
	feel: string;
	wildcard: string | null;
	composed: string;
	negative: string;
	edited_by_table: number;
	actor: string;
	created_at: number;
}

export async function getPromptRowById(d: D1Database, id: string): Promise<PromptRow | null> {
	const db = await dbWith(d, 'prompt', PROMPT_SCHEMA);
	if (!db) return null;
	const row = await db
		.prepare(
			`SELECT id, mood, material, programme, feel, wildcard, composed, negative, edited_by_table, actor, created_at
             FROM prompt WHERE id = ?`
		)
		.bind(id)
		.first<PromptRawRow>();
	if (!row) return null;
	return {
		id: row.id,
		mood: row.mood,
		material: row.material,
		programme: row.programme,
		feel: row.feel,
		wildcard: row.wildcard,
		composed: row.composed,
		negative: row.negative,
		editedByTable: !!row.edited_by_table,
		actor: row.actor,
		createdAt: row.created_at
	};
}

/* -------------------------------------------------------------------------- */
/* Beat — the projector's current stage direction (game-flow.md §4/§5). A    */
/* SEPARATE table from gate.ts's `room_state` (the submission lock): the two */
/* are different concerns polled by different screens, and `d1.ts`'s "adding */
/* a column is a no-op locally / throws in production" rule means a         */
/* `room_state` column can't be added after the fact anyway. One row per     */
/* event, `id` always 1, same upsert shape `gate.ts`'s lock already uses.    */
/* -------------------------------------------------------------------------- */

export type Beat = 'lobby' | 'progress' | 'reveal' | 'focus';

export const ROOM_BEAT_SCHEMA = `CREATE TABLE IF NOT EXISTS room_beat (
	event_id TEXT NOT NULL,
	id INTEGER NOT NULL,
	beat TEXT NOT NULL,
	focus_table INTEGER,
	set_at INTEGER NOT NULL,
	PRIMARY KEY (event_id, id)
)`;

export interface BeatState {
	beat: Beat;
	focusTable: number | null;
}

/** `focusTable` is only meaningful when `beat === 'focus'`; callers pass null otherwise. */
export async function setBeat(d: D1Database, eventId: string, beat: Beat, focusTable: number | null = null): Promise<void> {
	const db = await dbWith(d, 'room_beat', ROOM_BEAT_SCHEMA);
	if (!db) return;
	await db
		.prepare(
			`INSERT INTO room_beat (event_id, id, beat, focus_table, set_at) VALUES (?, 1, ?, ?, ?)
             ON CONFLICT(event_id, id) DO UPDATE SET beat = excluded.beat, focus_table = excluded.focus_table, set_at = excluded.set_at`
		)
		.bind(eventId, beat, focusTable, Date.now())
		.run();
}

/** Poll-safe: never throws, defaults to `lobby`/no focus on any failure or before the first `setBeat` call — same posture as `gate.ts`'s `lockedAt`/`mayReopen`. */
export async function getBeat(d: D1Database, eventId: string): Promise<BeatState> {
	try {
		const db = await dbWith(d, 'room_beat', ROOM_BEAT_SCHEMA);
		if (!db) return { beat: 'lobby', focusTable: null };
		const row = await db
			.prepare(`SELECT beat, focus_table FROM room_beat WHERE event_id = ? AND id = 1`)
			.bind(eventId)
			.first<{ beat: string; focus_table: number | null }>();
		if (!row) return { beat: 'lobby', focusTable: null };
		return { beat: row.beat as Beat, focusTable: row.focus_table };
	} catch {
		return { beat: 'lobby', focusTable: null };
	}
}

/* -------------------------------------------------------------------------- */
/* Table reset — a watermark, not a delete (game-flow.md §5/§8's "table 6"). */
/*                                                                            */
/* `answer`/`prompt`/`image` are append-only-or-lifecycle-only above for a   */
/* reason: nothing in this file may delete or rewrite a row's content. So    */
/* "reset table 6" is NOT a tombstone on old rows (`currentAnswers`/         */
/* `getCurrentImage` would still return them) and NOT a new column on        */
/* `event_table` (d1.ts: adding a column is a silent no-op locally, throws   */
/* in production). It is a new append-only table holding one watermark      */
/* timestamp per reset; every row created before it is still in D1 for the  */
/* audit trail, just not "current" to a *Since read taken after it.         */
/*                                                                            */
/* HANDOFF: `getTableState`/`getCurrentAnswers`/`getCurrentImage` — the read */
/* paths `answers.remote.ts` and the three tickers already call — do NOT    */
/* consult this watermark. This workstream only ADDS `getCurrentAnswersSince`*/
/* / `getCurrentImageSince` for admin's own reads (the poll + export);       */
/* wiring the phone/projector's own reads to respect a reset is a follow-up */
/* for whoever owns those call sites, flagged rather than done here.        */
/* -------------------------------------------------------------------------- */

export const TABLE_RESET_SCHEMA = `CREATE TABLE IF NOT EXISTS table_reset (
	event_id TEXT NOT NULL,
	table_no INTEGER NOT NULL,
	reset_at INTEGER NOT NULL,
	actor TEXT NOT NULL,
	created_at INTEGER NOT NULL
)`;

export const TABLE_RESET_IDX = `CREATE INDEX IF NOT EXISTS table_reset_idx ON table_reset (event_id, table_no, reset_at DESC)`;

/** The most recent reset watermark for a table, or 0 (the epoch) if it was never reset — so `createdAt > getResetAt(...)` is always a valid filter. */
export async function getResetAt(d: D1Database, eventId: string, table: number): Promise<number> {
	const db = await dbWith(d, 'table_reset', TABLE_RESET_SCHEMA);
	if (!db) return 0;
	const row = await db
		.prepare(`SELECT MAX(reset_at) as reset_at FROM table_reset WHERE event_id = ? AND table_no = ?`)
		.bind(eventId, table)
		.first<{ reset_at: number | null }>();
	return row?.reset_at ?? 0;
}

/**
 * Appends a reset watermark and clears `event_table.submitted_at` — the
 * latter is a lifecycle-field mutation of the same kind `finishTable`
 * already performs (not a content edit of an append-only row), and is what
 * lets the table's phone treat itself as unsubmitted again. Every answer,
 * prompt and image row from before the reset stays in D1 untouched.
 */
export async function resetTable(d: D1Database, eventId: string, table: number, actor: 'admin' | 'system' = 'admin'): Promise<void> {
	const db = await dbWith(d, 'table_reset', TABLE_RESET_SCHEMA);
	await dbWith(d, 'table_reset_idx', TABLE_RESET_IDX);
	if (db) {
		await db
			.prepare(`INSERT INTO table_reset (event_id, table_no, reset_at, actor, created_at) VALUES (?, ?, ?, ?, ?)`)
			.bind(eventId, table, Date.now(), actor, Date.now())
			.run();
	}
	const et = await dbWith(d, 'event_table', EVENT_TABLE_SCHEMA);
	if (et) {
		await et
			.prepare(`UPDATE event_table SET submitted_at = NULL WHERE event_id = ? AND table_no = ?`)
			.bind(eventId, table)
			.run();
	}
}

/** `getCurrentAnswers`, filtered to what's current SINCE a reset — the resolved (latest-wins) row's own `createdAt` is what's compared, so a question untouched since the reset correctly reads as unanswered again. */
export async function getCurrentAnswersSince(d: D1Database, eventId: string, table: number, sinceTs: number): Promise<AnswerRow[]> {
	const rows = await getCurrentAnswers(d, eventId, table);
	return rows.filter((r) => r.createdAt > sinceTs);
}

/** `getCurrentImage`, filtered the same way. */
export async function getCurrentImageSince(
	d: D1Database,
	eventId: string,
	table: number,
	zoneKey: string,
	sinceTs: number
): Promise<ImageRow | null> {
	const row = await getCurrentImage(d, eventId, table, zoneKey);
	return row && row.createdAt > sinceTs ? row : null;
}

/* -------------------------------------------------------------------------- */
/* Admin room read — BATCHED, not TABLE_COUNT×N point reads (game-flow.md    */
/* §8's "one runnable check per non-trivial rule" applies to cost too: a     */
/* poll every 3s cannot cost 20×(1 event_table + 1 answer-count + 4 image)   */
/* reads). Three queries total regardless of table count: event_table,      */
/* answer existence, current images (SQLite's documented "bare column       */
/* follows a lone MAX()" rule gives the winning row's `state` for free) —   */
/* merged with the reset watermark in JS.                                   */
/* -------------------------------------------------------------------------- */

export interface AdminImageState {
	zoneKey: string;
	state: GenerationState;
	createdAt: number;
}

export interface AdminRoomRow {
	table: number;
	futureKey: string | null;
	submittedAt: number | null;
	lastSeenAt: number | null;
	/** Distinct question ids with a current (post-reset) answer — a rough step count, not `getTableState`'s exact one. */
	answeredCount: number;
	/** Current (post-reset) image state per zone this table has ever drawn. */
	images: AdminImageState[];
}

export async function countTables(d: D1Database, eventId: string): Promise<number> {
	const db = await dbWith(d, 'event_table', EVENT_TABLE_SCHEMA);
	if (!db) return 0;
	const row = await db.prepare(`SELECT COUNT(*) as n FROM event_table WHERE event_id = ?`).bind(eventId).first<{ n: number }>();
	return row?.n ?? 0;
}

export async function getAdminRoomRows(d: D1Database, eventId: string, tableCount: number): Promise<AdminRoomRow[]> {
	const etDb = await dbWith(d, 'event_table', EVENT_TABLE_SCHEMA);
	const answerDb = await dbWith(d, 'answer', ANSWER_SCHEMA);
	const imageDb = await dbWith(d, 'image', IMAGE_SCHEMA);
	const resetDb = await dbWith(d, 'table_reset', TABLE_RESET_SCHEMA);

	const [etRes, answerRes, imageRes, resetRes] = await Promise.all([
		etDb
			? etDb
					.prepare(`SELECT table_no, future_key, submitted_at, last_seen_at FROM event_table WHERE event_id = ?`)
					.bind(eventId)
					.all<{ table_no: number; future_key: string | null; submitted_at: number | null; last_seen_at: number | null }>()
			: Promise.resolve({ results: [] as never[] }),
		answerDb
			? answerDb
					.prepare(`SELECT table_no, question_id, MAX(created_at) as created_at FROM answer WHERE event_id = ? GROUP BY table_no, question_id`)
					.bind(eventId)
					.all<{ table_no: number; question_id: string; created_at: number }>()
			: Promise.resolve({ results: [] as never[] }),
		imageDb
			? imageDb
					.prepare(`SELECT table_no, zone_key, state, MAX(created_at) as created_at FROM image WHERE event_id = ? GROUP BY table_no, zone_key`)
					.bind(eventId)
					.all<{ table_no: number; zone_key: string; state: string; created_at: number }>()
			: Promise.resolve({ results: [] as never[] }),
		resetDb
			? resetDb
					.prepare(`SELECT table_no, MAX(reset_at) as reset_at FROM table_reset WHERE event_id = ? GROUP BY table_no`)
					.bind(eventId)
					.all<{ table_no: number; reset_at: number }>()
			: Promise.resolve({ results: [] as never[] })
	]);

	const resetAt = new Map<number, number>((resetRes.results ?? []).map((r) => [r.table_no, r.reset_at]));
	const byTable = new Map<number, { futureKey: string | null; submittedAt: number | null; lastSeenAt: number | null }>();
	for (const r of etRes.results ?? []) byTable.set(r.table_no, { futureKey: r.future_key, submittedAt: r.submitted_at, lastSeenAt: r.last_seen_at });

	const answeredByTable = new Map<number, Set<string>>();
	for (const r of answerRes.results ?? []) {
		if (r.created_at <= (resetAt.get(r.table_no) ?? 0)) continue;
		let set = answeredByTable.get(r.table_no);
		if (!set) answeredByTable.set(r.table_no, (set = new Set()));
		set.add(r.question_id);
	}

	const imagesByTable = new Map<number, AdminImageState[]>();
	for (const r of imageRes.results ?? []) {
		if (r.created_at <= (resetAt.get(r.table_no) ?? 0)) continue;
		let arr = imagesByTable.get(r.table_no);
		if (!arr) imagesByTable.set(r.table_no, (arr = []));
		arr.push({ zoneKey: r.zone_key, state: r.state as GenerationState, createdAt: r.created_at });
	}

	const rows: AdminRoomRow[] = [];
	for (let t = 1; t <= tableCount; t++) {
		const et = byTable.get(t);
		rows.push({
			table: t,
			futureKey: et?.futureKey ?? null,
			submittedAt: et?.submittedAt ?? null,
			lastSeenAt: et?.lastSeenAt ?? null,
			answeredCount: answeredByTable.get(t)?.size ?? 0,
			images: imagesByTable.get(t) ?? []
		});
	}
	return rows;
}

/** Fills every table 1..tableCount with a bare `event_table` row, refusing (rather than overwriting) if the room already has any — "refuses if the room is not empty" (game-flow.md §5). `ON CONFLICT ... DO NOTHING` makes a re-run after a partial failure safe to retry. */
export async function seedTables(
	d: D1Database,
	eventId: string,
	tableCount: number
): Promise<{ ok: true; seeded: number } | { ok: false; reason: string }> {
	const db = await dbWith(d, 'event_table', EVENT_TABLE_SCHEMA);
	if (!db) return { ok: false, reason: 'no environment' };
	if ((await countTables(d, eventId)) > 0) return { ok: false, reason: 'the room already has tables — seed only runs on an empty room' };
	const now = Date.now();
	for (let t = 1; t <= tableCount; t++) {
		await db
			.prepare(
				`INSERT INTO event_table (id, event_id, table_no, mode, last_seen_at, created_at)
                 VALUES (?, ?, ?, 'tap', ?, ?)
                 ON CONFLICT(event_id, table_no) DO NOTHING`
			)
			.bind(newId(), eventId, t, now, now)
			.run();
	}
	return { ok: true, seeded: tableCount };
}

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
	images: { zoneKey: string; r2Key: string | null; state: GenerationState; createdAt: number; prompt: PromptRow | null }[];
}

export async function exportRoomRows(d: D1Database, eventId: string, tableCount: number, zoneKeys: readonly string[]): Promise<ExportTableRow[]> {
	const etDb = await dbWith(d, 'event_table', EVENT_TABLE_SCHEMA);
	const rows: ExportTableRow[] = [];
	for (let t = 1; t <= tableCount; t++) {
		const since = await getResetAt(d, eventId, t);
		const answers = await getCurrentAnswersSince(d, eventId, t, since);
		const et = etDb
			? await etDb
					.prepare(`SELECT future_key, submitted_at FROM event_table WHERE event_id = ? AND table_no = ?`)
					.bind(eventId, t)
					.first<{ future_key: string | null; submitted_at: number | null }>()
			: null;
		const images: ExportTableRow['images'] = [];
		for (const zoneKey of zoneKeys) {
			const img = await getCurrentImageSince(d, eventId, t, zoneKey, since);
			if (!img) continue;
			images.push({
				zoneKey,
				r2Key: img.r2Key,
				state: img.state,
				createdAt: img.createdAt,
				prompt: await getPromptRowById(d, img.promptId)
			});
		}
		rows.push({
			table: t,
			futureKey: et?.future_key ?? null,
			submittedAt: et?.submitted_at ?? null,
			resetAt: since,
			answers,
			images
		});
	}
	return rows;
}
