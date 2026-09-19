/**
 * PROJECTOR VIEW TYPES — shared shape between `gallery.remote.ts` (server
 * read), `fixtures.ts` (fake data for `?fixtures=1`) and the beat
 * components. One shape for both so a component never has to branch on
 * "is this real or fake data".
 */

/** Six states, per game-flow.md §4's Progress beat cell text ("not started ·
 *  answering (n of 13) · drawing · in"), split into the finer set the brief
 *  asked for. `choosing`/`answering` collapse to `answering` for live data —
 *  see gallery.remote.ts's module note on why. */
export type TableBeatState = 'not-started' | 'choosing' | 'answering' | 'reviewing' | 'drawing' | 'done';

/** Matches `room.ts`'s `ImageRow.state` (`generate.ts`'s `GenerationState`:
 *  `queued | requested | stored | done | failed`), plus `none` for a zone
 *  with no image row yet. */
export type ZoneImageState = 'queued' | 'requested' | 'stored' | 'done' | 'failed' | 'none';

export interface ZoneImageView {
	zone: string;
	state: ZoneImageState;
	/** Wire URL for this zone's image (served via `projector/img/[...key]`), or null if nothing stored yet. */
	url: string | null;
}

export interface TableView {
	table: number;
	beatState: TableBeatState;
	/** How many questions have a current answer, or `totalSteps` once submitted. Null only in fixtures that deliberately omit it. */
	step: number | null;
	totalSteps: number;
	/** The future this table chose, or null before the future card is answered. */
	futureKey: string | null;
	images: ZoneImageView[];
}

/** Mirrors `room.ts`'s `Beat`. The wall follows this, not the URL. */
export type ProjectorBeat = 'lobby' | 'progress' | 'reveal' | 'focus' | 'finale';

export interface ProjectorRoom {
	/** What the desk last pressed (`room_beat`), or `lobby` before anything was pressed. */
	beat: ProjectorBeat;
	/** The table the `focus` beat is pointed at. */
	focusTable: number | null;
	tables: TableView[];
}
