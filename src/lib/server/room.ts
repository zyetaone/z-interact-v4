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
import { dbWith, isTransientD1Error, monotonicNow } from './d1';
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
				monotonicNow()
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

/**
 * The highest `q<N>` reached among a table's ANSWERED question ids, or 0 if
 * none. `room.ts` stays content-free (no `game/questions.ts` import), so
 * this reads the fixed `q<N>` id shape those questions happen to use rather
 * than the real step index a content-aware caller (which knows the actual
 * question order, including the non-numbered `future`/wildcard ids) would
 * compute — a plumbing-level "how far in" signal, not `getTableState`'s
 * exact count. Existence-only (any row for that id, ignoring supersession):
 * a cleared-then-reconsidered answer still means the table reached that
 * question.
 */
function highestQuestionIndex(questionIds: readonly string[]): number {
	let max = 0;
	for (const id of questionIds) {
		// V4 ids carry a letter suffix (q4w, q5c, q6r); an And row (q2:and) is not a step.
		const m = /^q(\d+)[a-z]*$/.exec(id);
		if (m) max = Math.max(max, Number(m[1]));
	}
	return max;
}

/**
 * Full room snapshot for the projector poll. `currentStep` used to be
 * hardcoded to 0 (gallery.remote.ts's own module note #2 flagged this) —
 * now real, and batched: one extra query for every table's answered
 * question ids, not `tableCount` calls to `getCurrentAnswers`/
 * `getTableState` (the latter is an upsert, per that same note).
 */
export async function getRoom(d: D1Database, eventId: string, tableCount: number): Promise<RoomSnapshot> {
	const etDb = await dbWith(d, 'event_table', EVENT_TABLE_SCHEMA);
	if (!etDb) return { tables: [] };
	const answerDb = await dbWith(d, 'answer', ANSWER_SCHEMA);

	const [etRes, answerRes] = await Promise.all([
		etDb
			.prepare(`SELECT table_no, submitted_at FROM event_table WHERE event_id = ?`)
			.bind(eventId)
			.all<{ table_no: number; submitted_at: number | null }>(),
		answerDb
			? answerDb
					.prepare(`SELECT table_no, question_id FROM answer WHERE event_id = ? GROUP BY table_no, question_id`)
					.bind(eventId)
					.all<{ table_no: number; question_id: string }>()
			: Promise.resolve({ results: [] as { table_no: number; question_id: string }[] })
	]);

	const byTable = new Map((etRes.results ?? []).map((r) => [r.table_no, r]));
	const idsByTable = new Map<number, string[]>();
	for (const r of answerRes.results ?? []) {
		let arr = idsByTable.get(r.table_no);
		if (!arr) idsByTable.set(r.table_no, (arr = []));
		arr.push(r.question_id);
	}

	const tables: TableState[] = [];
	for (let t = 1; t <= tableCount; t++) {
		const row = byTable.get(t);
		tables.push({ table: t, currentStep: highestQuestionIndex(idsByTable.get(t) ?? []), submittedAt: row?.submitted_at ?? null });
	}
	return { tables };
}

/**
 * Every table's chosen future, batched — for the projector's future-per-
 * table need (gallery.remote.ts's module note #1). Reads the `answer`
 * table's `future` pseudo-question (`answers.remote.ts`'s local
 * `FUTURE_ID` constant), NOT `event_table.future_key` — that column exists
 * in the `EVENT_TABLE_SCHEMA` above but nothing in this codebase writes
 * it (`saveFuture` in `answers.remote.ts` stores the pick as an ordinary
 * `answer` row, same as every other question); reading the column would
 * return null for every table. The id string is inlined here rather than
 * imported from that route module (this file stays content/route-free) —
 * it is this app's one fixed pseudo-question id, matching `FUTURE_ID`'s own
 * status there as a local const.
 */
const FUTURE_QUESTION_ID = 'future';

export async function getTableFutures(d: D1Database, eventId: string): Promise<Map<number, string | null>> {
	const db = await dbWith(d, 'answer', ANSWER_SCHEMA);
	const out = new Map<number, string | null>();
	if (!db) return out;
	// "Bare column follows the lone MAX()" (SQLite's documented behaviour for
	// a single min()/max() aggregate): `keys` comes from each table's newest
	// `future` row, i.e. latest-wins, in one query rather than `tableCount`
	// calls to `getCurrentAnswers`.
	const { results } = await db
		.prepare(`SELECT table_no, keys, MAX(created_at) as created_at FROM answer WHERE event_id = ? AND question_id = ? GROUP BY table_no`)
		.bind(eventId, FUTURE_QUESTION_ID)
		.all<{ table_no: number; keys: string; created_at: number }>();
	for (const r of results ?? []) {
		try {
			const keys = JSON.parse(r.keys) as unknown;
			out.set(r.table_no, Array.isArray(keys) && typeof keys[0] === 'string' && keys[0] ? keys[0] : null);
		} catch {
			out.set(r.table_no, null);
		}
	}
	return out;
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
			monotonicNow()
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

export type Beat = 'lobby' | 'progress' | 'reveal' | 'focus' | 'finale';

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
			.bind(eventId, table, monotonicNow(), actor, monotonicNow())
			.run();
	}
	const et = await dbWith(d, 'event_table', EVENT_TABLE_SCHEMA);
	if (et) {
		await et
			.prepare(`UPDATE event_table SET submitted_at = NULL WHERE event_id = ? AND table_no = ?`)
			.bind(eventId, table)
			.run();
	}
	// Renders already in flight for this table are ABANDONED, not left
	// running. The watermark only filters READS; a `queued`/`requested` row
	// stays pending, and the admin poll's ticker walks every pending row in
	// the event, so a reset mid-generation used to be followed by fal bills
	// for work the desk had just thrown away. `failed` is terminal, so every
	// ticker skips them from here on.
	const img = await dbWith(d, 'image', IMAGE_SCHEMA);
	if (img) {
		try {
			await img
				.prepare(
					`UPDATE image SET state = 'failed', error = 'the desk reset this table'
                     WHERE event_id = ? AND table_no = ? AND state IN ('queued', 'requested')`
				)
				.bind(eventId, table)
				.run();
		} catch (e) {
			if (!isTransientD1Error(e)) throw e;
		}
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
	/** The stored object's key, or null before it lands. Carried so the projector's own read can build image URLs from this ONE batched query instead of a point read per table per zone. */
	r2Key: string | null;
	/** The provider's own words when `state` is `failed`, so the desk can show WHY before redrawing one zone. */
	error: string | null;
}

export interface AdminRoomRow {
	table: number;
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

export interface HealthCounts {
	/** Rows a ticker still owes work on — `queued` or `requested`. */
	pending: number;
	/**
	 * Rows that failed recently. Counted on `created_at` (there is no
	 * `updated_at` column), so this is "a row queued in the window that has
	 * since failed" — a render that sat for longer than the window before
	 * failing ages out of it. Good enough for "is the room failing right
	 * now"; not an audit of every failure.
	 */
	failedRecent: number;
	/** Tables past `finishTable` and not since reset. */
	submitted: number;
}

/** Two counts for `/health` — aggregate in SQL rather than pulling the rows back to count them. */
export async function getHealthCounts(d: D1Database, eventId: string, failedSince: number): Promise<HealthCounts> {
	const imageDb = await dbWith(d, 'image', IMAGE_SCHEMA);
	const etDb = await dbWith(d, 'event_table', EVENT_TABLE_SCHEMA);
	const [images, tables] = await Promise.all([
		imageDb
			? imageDb
					.prepare(
						`SELECT
							SUM(CASE WHEN state IN ('queued', 'requested') THEN 1 ELSE 0 END) AS pending,
							SUM(CASE WHEN state = 'failed' AND created_at >= ? THEN 1 ELSE 0 END) AS failed_recent
						 FROM image WHERE event_id = ?`
					)
					.bind(failedSince, eventId)
					.first<{ pending: number | null; failed_recent: number | null }>()
			: Promise.resolve(null),
		etDb
			? etDb
					.prepare(`SELECT COUNT(*) AS n FROM event_table WHERE event_id = ? AND submitted_at IS NOT NULL`)
					.bind(eventId)
					.first<{ n: number }>()
			: Promise.resolve(null)
	]);
	return {
		pending: images?.pending ?? 0,
		failedRecent: images?.failed_recent ?? 0,
		submitted: tables?.n ?? 0
	};
}

export async function getAdminRoomRows(d: D1Database, eventId: string, tableCount: number): Promise<AdminRoomRow[]> {
	const etDb = await dbWith(d, 'event_table', EVENT_TABLE_SCHEMA);
	const answerDb = await dbWith(d, 'answer', ANSWER_SCHEMA);
	const imageDb = await dbWith(d, 'image', IMAGE_SCHEMA);
	const resetDb = await dbWith(d, 'table_reset', TABLE_RESET_SCHEMA);

	const [etRes, answerRes, imageRes, resetRes] = await Promise.all([
		etDb
			? etDb
					.prepare(`SELECT table_no, submitted_at, last_seen_at FROM event_table WHERE event_id = ?`)
					.bind(eventId)
					.all<{ table_no: number; submitted_at: number | null; last_seen_at: number | null }>()
			: Promise.resolve({ results: [] as never[] }),
		answerDb
			? answerDb
					.prepare(`SELECT table_no, question_id, MAX(created_at) as created_at FROM answer WHERE event_id = ? GROUP BY table_no, question_id`)
					.bind(eventId)
					.all<{ table_no: number; question_id: string; created_at: number }>()
			: Promise.resolve({ results: [] as never[] }),
		imageDb
			? imageDb
					.prepare(
						`SELECT table_no, zone_key, state, r2_key, error, MAX(created_at) as created_at FROM image WHERE event_id = ? GROUP BY table_no, zone_key`
					)
					.bind(eventId)
					.all<{ table_no: number; zone_key: string; state: string; r2_key: string | null; error: string | null; created_at: number }>()
			: Promise.resolve({ results: [] as never[] }),
		resetDb
			? resetDb
					.prepare(`SELECT table_no, MAX(reset_at) as reset_at FROM table_reset WHERE event_id = ? GROUP BY table_no`)
					.bind(eventId)
					.all<{ table_no: number; reset_at: number }>()
			: Promise.resolve({ results: [] as never[] })
	]);

	const resetAt = new Map<number, number>((resetRes.results ?? []).map((r) => [r.table_no, r.reset_at]));
	const byTable = new Map<number, { submittedAt: number | null; lastSeenAt: number | null }>();
	for (const r of etRes.results ?? []) byTable.set(r.table_no, { submittedAt: r.submitted_at, lastSeenAt: r.last_seen_at });

	const answeredByTable = new Map<number, Set<string>>();
	for (const r of answerRes.results ?? []) {
		if (r.created_at <= (resetAt.get(r.table_no) ?? 0)) continue;
		// An "And:" sub-question's row (`<qid>:and`, game/questions.ts's `andId`)
		// is part of its parent's step, not a step of its own — without this a
		// table on its third question reads "6 of 9" on the wall.
		if (r.question_id.endsWith(':and')) continue;
		// Nor is `q1`: it is the era CHIP on the lens screen, not a screen of
		// its own, and the phone has never counted it (`FLOW_QUESTIONS`). It
		// is counted against `STEP_IDS` now, which is the phone's own scale —
		// see that constant for what the two disagreeing counts cost.
		if (r.question_id === 'q1') continue;
		let set = answeredByTable.get(r.table_no);
		if (!set) answeredByTable.set(r.table_no, (set = new Set()));
		set.add(r.question_id);
	}

	const imagesByTable = new Map<number, AdminImageState[]>();
	for (const r of imageRes.results ?? []) {
		if (r.created_at <= (resetAt.get(r.table_no) ?? 0)) continue;
		let arr = imagesByTable.get(r.table_no);
		if (!arr) imagesByTable.set(r.table_no, (arr = []));
		arr.push({ zoneKey: r.zone_key, state: r.state as GenerationState, createdAt: r.created_at, r2Key: r.r2_key, error: r.error ?? null });
	}

	const rows: AdminRoomRow[] = [];
	for (let t = 1; t <= tableCount; t++) {
		const et = byTable.get(t);
		rows.push({
			table: t,
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
	return tableCount;
}

export type ClearedCounts = { answer: number; prompt: number; image: number; narrative: number; table_reset: number };

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
	const out: ClearedCounts = { answer: 0, prompt: 0, image: 0, narrative: 0, table_reset: 0 };
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
