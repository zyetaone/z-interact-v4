/**
 * BEAT — the projector's current stage direction (game-flow.md §4/§5).
 *
 * Split out of `room.ts` 22 Sep: this is the SHOW's choreography, not the
 * room's data. It changes when the run of play changes and at no other time,
 * which is why it is not in the file that changes when a question does.
 * `room.ts` re-exports these names.
 */
import { dbWith } from './d1';

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

