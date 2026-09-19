/**
 * ROOM MODEL — answers, tables, prompts and images for one event.
 *
 * DDL for all seven brief-listed tables (`events`, `tables`, `answers`,
 * `revisions`, `prompts`, `images`, plus `gate`'s two physical tables in
 * `gate.ts` — see that file's module note for why gate is split rather than
 * one table). Every row carries `event_id` so the archive step
 * (`wrangler d1 export`) needs no bespoke loader.
 *
 * Columns are deliberately minimal — TODO(content): the content workstreams'
 * `schema.draft.ts` may add columns (e.g. a `future` key on `tables`, once
 * the futures-palette work lands) but should not need to touch this file's
 * CRUD shape.
 */
import { dbWith, isTransientD1Error } from './d1';

export const EVENTS_SCHEMA = `CREATE TABLE IF NOT EXISTS events (
	event_id TEXT PRIMARY KEY,
	created_at INTEGER NOT NULL
)`;

export const TABLES_SCHEMA = `CREATE TABLE IF NOT EXISTS tables (
	event_id TEXT NOT NULL,
	table_no INTEGER NOT NULL,
	current_step INTEGER NOT NULL DEFAULT 0,
	submitted_at INTEGER,
	rev INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (event_id, table_no)
)`;

export const ANSWERS_SCHEMA = `CREATE TABLE IF NOT EXISTS answers (
	event_id TEXT NOT NULL,
	table_no INTEGER NOT NULL,
	question_id TEXT NOT NULL,
	keys TEXT NOT NULL,
	text TEXT,
	updated_at INTEGER NOT NULL,
	PRIMARY KEY (event_id, table_no, question_id)
)`;

export const REVISIONS_SCHEMA = `CREATE TABLE IF NOT EXISTS revisions (
	event_id TEXT NOT NULL,
	table_no INTEGER NOT NULL,
	rev INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (event_id, table_no, rev)
)`;

export const PROMPTS_SCHEMA = `CREATE TABLE IF NOT EXISTS prompts (
	event_id TEXT NOT NULL,
	table_no INTEGER NOT NULL,
	zone TEXT NOT NULL,
	rev INTEGER NOT NULL,
	prompt TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	PRIMARY KEY (event_id, table_no, zone, rev)
)`;

export const IMAGES_SCHEMA = `CREATE TABLE IF NOT EXISTS images (
	event_id TEXT NOT NULL,
	table_no INTEGER NOT NULL,
	zone TEXT NOT NULL,
	rev INTEGER NOT NULL,
	request_id TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending',
	r2_key TEXT,
	tile_key TEXT,
	made_at INTEGER,
	PRIMARY KEY (event_id, table_no, zone, rev),
	UNIQUE (request_id)
)`;

export interface AnswerInput {
	eventId: string;
	table: number;
	questionId: string;
	/** Selected option keys — TODO(content): validated against QUESTIONS[].options in game/questions.ts by the caller. */
	keys: string[];
	text?: Record<string, string>;
}

export interface AnswerRow {
	questionId: string;
	keys: string[];
	text?: Record<string, string>;
	updatedAt: number;
}

/** Per-screen save — not one form post. Earlier screens survive a stalled phone. */
export async function saveAnswer(d: D1Database, input: AnswerInput): Promise<void> {
	const db = await dbWith(d, 'answers', ANSWERS_SCHEMA);
	if (!db) return;
	try {
		await db
			.prepare(
				`INSERT INTO answers (event_id, table_no, question_id, keys, text, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(event_id, table_no, question_id) DO UPDATE SET
                   keys = excluded.keys, text = excluded.text, updated_at = excluded.updated_at`
			)
			.bind(
				input.eventId,
				input.table,
				input.questionId,
				JSON.stringify(input.keys),
				input.text ? JSON.stringify(input.text) : null,
				Date.now()
			)
			.run();
	} catch (e) {
		if (isTransientD1Error(e)) return;
		throw e;
	}
}

/** Reads back a table's held answers, decoding JSON columns. Drops rows that fail to parse rather than throwing (matches presence's `rowToAnswer` tolerance for stale data). */
export function rowToAnswers(
	rows: { question_id: string; keys: string; text: string | null; updated_at: number }[]
): AnswerRow[] {
	const out: AnswerRow[] = [];
	for (const row of rows) {
		try {
			const keys = JSON.parse(row.keys) as unknown;
			if (!Array.isArray(keys) || !keys.every((k) => typeof k === 'string')) continue;
			out.push({
				questionId: row.question_id,
				keys,
				text: row.text ? (JSON.parse(row.text) as Record<string, string>) : undefined,
				updatedAt: row.updated_at
			});
		} catch {
			continue;
		}
	}
	return out;
}

export async function getTableAnswers(d: D1Database, eventId: string, table: number): Promise<AnswerRow[]> {
	const db = await dbWith(d, 'answers', ANSWERS_SCHEMA);
	if (!db) return [];
	const { results } = await db
		.prepare(`SELECT question_id, keys, text, updated_at FROM answers WHERE event_id = ? AND table_no = ?`)
		.bind(eventId, table)
		.all<{ question_id: string; keys: string; text: string | null; updated_at: number }>();
	return rowToAnswers(results ?? []);
}

export interface TableState {
	table: number;
	currentStep: number;
	submittedAt: number | null;
	rev: number;
}

async function ensureTableRow(db: D1Database, eventId: string, table: number): Promise<void> {
	await db
		.prepare(
			`INSERT INTO tables (event_id, table_no, current_step, rev) VALUES (?, ?, 0, 0)
             ON CONFLICT(event_id, table_no) DO NOTHING`
		)
		.bind(eventId, table)
		.run();
}

export async function getTableState(d: D1Database, eventId: string, table: number): Promise<TableState> {
	const db = await dbWith(d, 'tables', TABLES_SCHEMA);
	if (!db) return { table, currentStep: 0, submittedAt: null, rev: 0 };
	await ensureTableRow(db, eventId, table);
	const row = await db
		.prepare(`SELECT current_step, submitted_at, rev FROM tables WHERE event_id = ? AND table_no = ?`)
		.bind(eventId, table)
		.first<{ current_step: number; submitted_at: number | null; rev: number }>();
	return {
		table,
		currentStep: row?.current_step ?? 0,
		submittedAt: row?.submitted_at ?? null,
		rev: row?.rev ?? 0
	};
}

export async function advanceStep(d: D1Database, eventId: string, table: number, step: number): Promise<void> {
	const db = await dbWith(d, 'tables', TABLES_SCHEMA);
	if (!db) return;
	await ensureTableRow(db, eventId, table);
	await db
		.prepare(`UPDATE tables SET current_step = ? WHERE event_id = ? AND table_no = ?`)
		.bind(step, eventId, table)
		.run();
}

/** Marks a table submitted for its current `rev`. Bumping `rev` on a reopen is the caller's job (`gate.ts`'s `grantReopen` + a fresh `finishTable`), so an image row keyed on the old rev never collides with the new one. */
export async function finishTable(d: D1Database, eventId: string, table: number): Promise<TableState> {
	const db = await dbWith(d, 'tables', TABLES_SCHEMA);
	if (!db) return { table, currentStep: 0, submittedAt: null, rev: 0 };
	await ensureTableRow(db, eventId, table);
	await db
		.prepare(`UPDATE tables SET submitted_at = ? WHERE event_id = ? AND table_no = ?`)
		.bind(Date.now(), eventId, table)
		.run();
	return getTableState(d, eventId, table);
}

export interface RoomSnapshot {
	tables: TableState[];
}

/** Full room snapshot for the projector poll. */
export async function getRoom(d: D1Database, eventId: string, tableCount: number): Promise<RoomSnapshot> {
	const db = await dbWith(d, 'tables', TABLES_SCHEMA);
	if (!db) return { tables: [] };
	const { results } = await db
		.prepare(`SELECT table_no, current_step, submitted_at, rev FROM tables WHERE event_id = ?`)
		.bind(eventId)
		.all<{ table_no: number; current_step: number; submitted_at: number | null; rev: number }>();
	const byTable = new Map((results ?? []).map((r) => [r.table_no, r]));
	const tables: TableState[] = [];
	for (let t = 1; t <= tableCount; t++) {
		const row = byTable.get(t);
		tables.push({
			table: t,
			currentStep: row?.current_step ?? 0,
			submittedAt: row?.submitted_at ?? null,
			rev: row?.rev ?? 0
		});
	}
	return { tables };
}
