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

/** Matches `generate.ts`'s `GenerationState` (`queued | submitted | rendering | stored | failed`),
 *  plus `none` for a zone with no generation row yet. */
export type ZoneImageState = 'queued' | 'submitted' | 'rendering' | 'stored' | 'failed' | 'none';

export interface ZoneImageView {
	zone: string;
	state: ZoneImageState;
	/** Wire URL for this zone's image (served via `projector/img/[...key]`), or null if nothing stored yet. */
	url: string | null;
}

export interface TableView {
	table: number;
	beatState: TableBeatState;
	/** Current question index, 1-based; null when not meaningfully known (see gallery.remote.ts note). */
	step: number | null;
	totalSteps: number;
	/** The future this table chose, or null if unknown (real data can't see this yet — see gallery.remote.ts). */
	futureKey: string | null;
	images: ZoneImageView[];
}

export interface ProjectorRoom {
	tables: TableView[];
}
