/**
 * THE SUBMISSION GATE — room-level lock and single-table reopen permissions.
 *
 * Ported from z-presence's `gate.ts`, split in two so the rule itself is
 * testable without D1 or a request context:
 *
 *   - `decideSubmit` is a PURE function of booleans. It is what
 *     `gate.test.ts` exercises directly — no fake database needed.
 *   - Everything below it does the D1 read/write and calls `decideSubmit`
 *     with what it read. `D1Database` is a plain argument (see `d1.ts`),
 *     never pulled from request-local storage in this file.
 *
 * Also per ADR-036 §3's ask for `error()`-free commands (SvelteKit's
 * `error()`/`redirect()` don't work inside `command`, only `query`/`form`):
 * `decideSubmit` returns a typed result instead of throwing. A `+server.ts`
 * or `query` caller that wants the old throw-based behaviour can still call
 * `error(decision.status, decision.reason)` itself.
 *
 * Both D1 tables (`room_state`, `table_reopen`) live under a single logical
 * "gate" concern per the brief's schema list, but keep separate physical
 * tables — same reasoning as presence: a lock is one row, a grant is one row
 * per table, and merging them would make "is this table locked AND
 * ungranted" a JOIN instead of two cheap point-reads.
 */
import { dbWith, isTransientD1Error } from './d1';

const ROOM_STATE_SCHEMA = `CREATE TABLE IF NOT EXISTS room_state (
	event_id TEXT NOT NULL,
	id INTEGER NOT NULL,
	locked_at INTEGER,
	PRIMARY KEY (event_id, id)
)`;

const TABLE_REOPEN_SCHEMA = `CREATE TABLE IF NOT EXISTS table_reopen (
	event_id TEXT NOT NULL,
	table_no INTEGER NOT NULL,
	granted_at INTEGER NOT NULL,
	PRIMARY KEY (event_id, table_no)
)`;

/* -------------------------------------------------------------------------- */
/* Pure rule                                                                   */
/* -------------------------------------------------------------------------- */

export interface GateInputs {
	/** False when the room/grant reads themselves failed (D1 unreachable). */
	reachable: boolean;
	/** Is the room currently closed to new answers? */
	locked: boolean;
	/** Has this table already submitted once? */
	alreadyAnswered: boolean;
	/** Does this table hold a one-shot reopen grant? */
	granted: boolean;
}

export type GateDecision =
	| { ok: true; consumeGrant: boolean }
	| { ok: false; status: 409 | 503; reason: string };

export function decideSubmit(inputs: GateInputs): GateDecision {
	if (!inputs.reachable) {
		return {
			ok: false,
			status: 503,
			reason:
				'We could not reach the room, so nothing was sent — your answer is still on this phone. Try again.'
		};
	}
	if (inputs.locked) {
		return {
			ok: false,
			status: 409,
			reason: 'The room is closed — your answer is in and the screen has moved on.'
		};
	}
	if (inputs.alreadyAnswered && !inputs.granted) {
		return {
			ok: false,
			status: 409,
			reason:
				'This table has already answered — that answer is in and counted. The desk can reopen your table if it needs changing.'
		};
	}
	return { ok: true, consumeGrant: inputs.alreadyAnswered && inputs.granted };
}

/* -------------------------------------------------------------------------- */
/* Room lock (room_state)                                                     */
/* -------------------------------------------------------------------------- */

async function lockedAtOrThrow(d: D1Database, eventId: string): Promise<number | null> {
	const db = await dbWith(d, 'room_state', ROOM_STATE_SCHEMA);
	if (!db) return null;
	const row = await db
		.prepare(`SELECT locked_at FROM room_state WHERE event_id = ? AND id = 1`)
		.bind(eventId)
		.first<{ locked_at: number | null }>();
	return row?.locked_at ?? null;
}

/** Poll-safe read: never throws, fails open (null). */
export async function lockedAt(d: D1Database, eventId: string): Promise<number | null> {
	try {
		return await lockedAtOrThrow(d, eventId);
	} catch {
		return null;
	}
}

/** Closes the room to further answers, or reopens it. */
export async function setLocked(d: D1Database, eventId: string, locked: boolean): Promise<void> {
	const db = await dbWith(d, 'room_state', ROOM_STATE_SCHEMA);
	if (!db) return;
	try {
		await db
			.prepare(
				`INSERT INTO room_state (event_id, id, locked_at) VALUES (?, 1, ?)
                 ON CONFLICT(event_id, id) DO UPDATE SET locked_at = excluded.locked_at`
			)
			.bind(eventId, locked ? Date.now() : null)
			.run();
	} catch (e) {
		if (isTransientD1Error(e)) return;
		throw e;
	}
}

/* -------------------------------------------------------------------------- */
/* Table reopen grants (table_reopen)                                         */
/* -------------------------------------------------------------------------- */

async function hasGrantOrThrow(d: D1Database, eventId: string, table: number): Promise<boolean> {
	const db = await dbWith(d, 'table_reopen', TABLE_REOPEN_SCHEMA);
	if (!db) return false;
	const row = await db
		.prepare(`SELECT table_no FROM table_reopen WHERE event_id = ? AND table_no = ?`)
		.bind(eventId, table)
		.first<{ table_no: number }>();
	return !!row;
}

/** Poll-safe read: never throws, fails closed (false). */
export async function mayReopen(d: D1Database, eventId: string, table: number): Promise<boolean> {
	try {
		return await hasGrantOrThrow(d, eventId, table);
	} catch {
		return false;
	}
}

/** Grants a specific table permission to submit one more time. */
export async function grantReopen(d: D1Database, eventId: string, table: number): Promise<void> {
	const db = await dbWith(d, 'table_reopen', TABLE_REOPEN_SCHEMA);
	if (!db) return;
	await db
		.prepare(
			`INSERT INTO table_reopen (event_id, table_no, granted_at) VALUES (?, ?, ?)
             ON CONFLICT(event_id, table_no) DO UPDATE SET granted_at = excluded.granted_at`
		)
		.bind(eventId, table, Date.now())
		.run();
}

/** Consumes the one-shot reopen grant after a successful resubmit. */
export async function consumeReopen(d: D1Database, eventId: string, table: number): Promise<void> {
	const db = await dbWith(d, 'table_reopen', TABLE_REOPEN_SCHEMA);
	if (!db) return;
	try {
		await db
			.prepare(`DELETE FROM table_reopen WHERE event_id = ? AND table_no = ?`)
			.bind(eventId, table)
			.run();
	} catch (e) {
		if (isTransientD1Error(e)) return;
		console.log(`[reopen] table ${table} grant not consumed — ${String(e).slice(0, 200)}`);
	}
}

/**
 * Reads room lock + grant state and applies the pure rule in one call — the
 * shape every `finishTable`/`saveAnswer` command actually wants.
 */
export async function assertCanSubmit(
	d: D1Database,
	eventId: string,
	table: number,
	alreadyAnswered: boolean
): Promise<GateDecision> {
	try {
		const [locked, granted] = await Promise.all([
			lockedAtOrThrow(d, eventId),
			alreadyAnswered ? hasGrantOrThrow(d, eventId, table) : Promise.resolve(false)
		]);
		const decision = decideSubmit({ reachable: true, locked: !!locked, alreadyAnswered, granted });
		if (decision.ok && decision.consumeGrant) await consumeReopen(d, eventId, table);
		return decision;
	} catch {
		return decideSubmit({ reachable: false, locked: false, alreadyAnswered, granted: false });
	}
}
