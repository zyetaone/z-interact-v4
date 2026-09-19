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
