/**
 * One read `room.ts` does not expose: the newest `prompt` row for a table,
 * with its four layer columns, not just `composed`.
 *
 * `room.ts`'s own `getPromptById` returns `{ composed }` — exactly what
 * `generate.ts`'s `tick()` submits, and nothing more. The review screen
 * needs the other half: the layer columns, which are how the table-level
 * BASE text is recovered after submit (see `answers.remote.ts`'s note on
 * one prompt row per zone).
 *
 * Kept here rather than in `room.ts` because that file is shared with two
 * concurrent workstreams; it is the obvious place for this to move to once
 * the tree is quiet.
 */
import { dbWith } from '$lib/server/d1';
import { PROMPT_SCHEMA } from '$lib/server/room';

export interface StoredPrompt {
	id: string;
	mood: string;
	material: string;
	programme: string;
	feel: string;
	wildcard: string | null;
	composed: string;
	negative: string;
	editedByTable: boolean;
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
	created_at: number;
}

/** The newest prompt row for a table — latest-wins, the same rule answers use. */
export async function getLatestPrompt(d: D1Database, eventId: string, table: number): Promise<StoredPrompt | null> {
	const db = await dbWith(d, 'prompt', PROMPT_SCHEMA);
	if (!db) return null;
	const row = await db
		.prepare(
			`SELECT id, mood, material, programme, feel, wildcard, composed, negative, edited_by_table, created_at
             FROM prompt WHERE event_id = ? AND table_no = ? ORDER BY created_at DESC LIMIT 1`
		)
		.bind(eventId, table)
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
		createdAt: row.created_at
	};
}
