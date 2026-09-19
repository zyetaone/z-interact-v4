/**
 * ADMIN VIEW TYPES — shared shape between `admin.remote.ts` (server read),
 * `fixtures.ts` (fake data for `?fixtures=1`) and `+page.svelte`. One shape
 * for both so the page never branches on "is this real or fake data".
 *
 * Mirrors the pattern `src/lib/ui/projector/types.ts` already set: a beat
 * enum + a per-table row shape + a room-level envelope.
 */

/** The projector beats (game-flow.md §4/§5). `focus` always carries a `focusTable`; `finale` cycles every table in turn. The column is TEXT, so adding a beat needs no DDL — `d1.ts` has no migration runner. */
export type Beat = 'lobby' | 'progress' | 'reveal' | 'focus' | 'finale';

export type ZoneImageState = 'queued' | 'requested' | 'stored' | 'done' | 'failed' | 'none';

export interface AdminTableRow {
	table: number;
	/** The future this table chose, or null before Q1 is answered. */
	futureKey: string | null;
	/** How many questions have a current answer. */
	step: number;
	totalSteps: number;
	submittedAt: number | null;
	/** Per-zone image state, in `ZONES` order. */
	images: ZoneImageState[];
	/** `images.filter(stored or done).length` — precomputed so the row component doesn't recount every poll. */
	imagesStored: number;
	/** Most recent of: last_seen_at, latest answer, latest image write. */
	lastActivityAt: number | null;
	/** True while this table holds a live one-shot reopen grant. */
	granted: boolean;
}

export interface AdminRoom {
	closed: boolean;
	beat: Beat;
	focusTable: number | null;
	tables: AdminTableRow[];
	/** True once any `event_table` row exists — gates the "seed 20 tables" button (only shown when empty). */
	seeded: boolean;
}
