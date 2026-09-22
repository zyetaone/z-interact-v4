/**
 * Two reads `room.ts` does not expose yet: the newest `prompt` row for a
 * table, and one prompt row by id.
 *
 * CLAUDE.md's "What's still open" names this as the last piece connecting
 * `insertPrompt`'s output to the ticker — without it every ticker submits
 * a placeholder string instead of the table's own composed prompt.
 *
 * Kept here rather than in `room.ts` because that file is shared with two
 * concurrent workstreams; it is the obvious place for this to move to once
 * the tree is quiet.
 */
import { dbWith } from "$lib/server/d1";
import { PROMPT_SCHEMA } from "$lib/server/room";

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

function toStored(row: PromptRawRow): StoredPrompt {
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
    createdAt: row.created_at,
  };
}

/** The newest prompt row for a table — latest-wins, the same rule answers use. */
export async function getLatestPrompt(
  d: D1Database,
  eventId: string,
  table: number,
  /**
   * The table's reset watermark. Every other read in this app applies one;
   * this did not, so a reset table's poll showed the PREVIOUS run's prompt,
   * a fresh run's first prompt claimed to supersede the room that was reset
   * away, and `retryZone` with no sidecar could compose the OLD prompt into
   * a NEW render — real money spent drawing the previous room's answers.
   */
  sinceTs = 0,
): Promise<StoredPrompt | null> {
  const db = await dbWith(d, "prompt", PROMPT_SCHEMA);
  if (!db) return null;
  const row = await db
    .prepare(
      `SELECT id, mood, material, programme, feel, wildcard, composed, negative, edited_by_table, created_at
             FROM prompt WHERE event_id = ? AND table_no = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(eventId, table, sinceTs)
    .first<PromptRawRow>();
  return row ? toStored(row) : null;
}

/** One prompt row by id — what a ticker resolves from an `image` row's `promptId`. */
export async function getPromptById(
  d: D1Database,
  id: string,
): Promise<StoredPrompt | null> {
  const db = await dbWith(d, "prompt", PROMPT_SCHEMA);
  if (!db) return null;
  const row = await db
    .prepare(
      `SELECT id, mood, material, programme, feel, wildcard, composed, negative, edited_by_table, created_at
             FROM prompt WHERE id = ?`,
    )
    .bind(id)
    .first<PromptRawRow>();
  return row ? toStored(row) : null;
}
