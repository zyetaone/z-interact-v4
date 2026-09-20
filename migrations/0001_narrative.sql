-- The `narrative` table: the phone done screen's read-back paragraph, one
-- append-only row per generation (routes/t/[table]/narrative.ts).
--
-- THIS FILE IS OPTIONAL. The app creates the table itself on first use, the
-- way it creates every other table (src/lib/server/d1.ts's ensureTable —
-- there is no migration runner in this project and adding one is not the
-- deal). It is here so a new event can pre-warm the schema with
-- `wrangler d1 execute` and see the table before the first phone submits.
--
-- The statements below are a copy of NARRATIVE_SCHEMA / NARRATIVE_IDX in
-- routes/t/[table]/narrative.ts. That file is the source of truth; if the
-- two ever disagree, the code wins, because the code is what runs.

CREATE TABLE IF NOT EXISTS narrative (
	id TEXT PRIMARY KEY,
	event_id TEXT NOT NULL,
	table_no INTEGER NOT NULL,
	text TEXT NOT NULL,
	model TEXT NOT NULL,
	actor TEXT NOT NULL,
	supersedes_id TEXT,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS narrative_current_idx
	ON narrative (event_id, table_no, created_at DESC);
