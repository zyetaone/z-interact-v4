/**
 * GROUPING BY LENS, WITHOUT NAMING IT.
 *
 * The owner ruled the lens a hidden analysis: a future's name must never
 * appear on any projector beat. Grouping and ordering by future are still
 * wanted — they are what makes the reveal say something about the argument
 * the room just had — so the lens survives on the wall as a POSITION and a
 * COLOUR (`accentForFuture`) and nothing else.
 *
 * Centralised here because the same index drives Progress's accent, the
 * reveal's page order and the finale's sequencing, and three copies of
 * `FUTURES.findIndex` is three places for a name to creep back in.
 */
import { FUTURES } from '$lib/game/futures';
import type { TableView } from './types';

const INDEX = new Map(FUTURES.map((f, i) => [f.key, i]));

/** Palette position of a table's lens, or null before one is chosen. */
export function futureIndexOf(futureKey: string | null | undefined): number | null {
	if (!futureKey) return null;
	return INDEX.get(futureKey) ?? null;
}

/**
 * Tables in lens order, tables with no lens yet last, table number breaking
 * ties — so tables that argued from the same future sit together on the wall
 * with no heading to say so.
 */
export function byLensThenTable(tables: TableView[]): TableView[] {
	const rank = (t: TableView) => futureIndexOf(t.futureKey) ?? FUTURES.length;
	return [...tables].sort((a, b) => rank(a) - rank(b) || a.table - b.table);
}

/**
 * Tables that have not sent their answers yet.
 *
 * "Still answering" counted every table that was not `done`, which on the
 * night read "4 tables still answering" while all twenty had submitted —
 * the four it was counting had submitted and then lost one zone to a
 * failed render. A table waiting on an image is not a table the room is
 * waiting on, and telling nineteen tables otherwise sends them looking for
 * someone who is already finished.
 *
 * `drawing` and `done` are both past the submit; everything before them is
 * not.
 */
const UNSUBMITTED: ReadonlySet<TableView['beatState']> = new Set([
	'not-started',
	'choosing',
	'answering',
	'reviewing'
] as const);

export function stillAnswering(tables: TableView[]): number {
	return tables.filter((t) => UNSUBMITTED.has(t.beatState)).length;
}
