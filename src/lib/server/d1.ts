/**
 * D1 ACCESS LAYER — pure, takes the binding as an argument.
 *
 * Ported from z-presence's `d1.ts`, with one deliberate change: presence
 * reached through `getRequestEvent()` internally, which meant every caller
 * (and every test of a caller) needed a live request context. Here the
 * `D1Database` is a parameter, so `ensureTable`/`isTransientD1Error` can be
 * exercised in vitest with a hand-rolled fake — no `$app/server` import in
 * this file, ever.
 */

/**
 * A D1 wobble rather than a real fault — the isolate being recycled
 * mid-request, or one of its two transport-level wrappers. All three mean
 * "try again", not "the SQL was wrong"; anything else is rethrown.
 */
export function isTransientD1Error(e: unknown): boolean {
	return (
		e instanceof Error &&
		(e.message.includes('poisoned stub') ||
			e.message.includes('D1_ERROR') ||
			e.message.includes('internal error') ||
			e.message.includes('fetch failed'))
	);
}

/**
 * PER BINDING **AND PER TABLE** — a single shared set would let one table's
 * CREATE mark the whole binding ready and skip every other table's DDL on
 * the first request of a fresh isolate. `WeakMap` keyed on the binding: a
 * recycled isolate hands back a fresh binding object, so its tables get
 * created again rather than being (wrongly) assumed to exist.
 *
 * No migration runner. Adding a column to an existing table is a no-op
 * locally and throws on the first insert in production — a new TABLE is the
 * only safe schema change this layer supports.
 */
const ready = new WeakMap<D1Database, Set<string>>();

/** CREATE TABLE IF NOT EXISTS, once per binding per table. */
export async function ensureTable(
	d: D1Database,
	table: string,
	sql: string,
	{ swallowAll = false }: { swallowAll?: boolean } = {}
): Promise<void> {
	let made = ready.get(d);
	if (!made) ready.set(d, (made = new Set()));
	if (made.has(table)) return;
	try {
		await d.prepare(sql).run();
	} catch (e) {
		if (swallowAll || isTransientD1Error(e)) return;
		throw e;
	}
	made.add(table);
}

/** Convenience: ensure a table exists against a resolved `D1Database`, or no-op if undefined. */
export async function dbWith(
	d: D1Database | undefined,
	table: string,
	sql: string,
	options?: { swallowAll?: boolean }
): Promise<D1Database | undefined> {
	if (!d) return undefined;
	await ensureTable(d, table, sql, options);
	return d;
}

/** Resets the per-binding "table exists" cache. Test-only escape hatch. */
export function _resetReadyForTests(d: D1Database): void {
	ready.delete(d);
}

/**
 * A strictly increasing "clock" for `created_at`/`updated_at` on append-only
 * rows (`room.ts`'s `answer`/`prompt`/`images`). Plain `Date.now()` is not
 * enough: two writes issued back to back — the exact append-only edit case,
 * e.g. an admin correction landing right after a table's own save — can
 * legitimately share a millisecond, and `currentAnswers()`'s tie-break
 * (`createdAt > held.createdAt`, strict) would then keep the OLDER row as
 * "current" simply because it read as `!(newer > older)` when they're
 * equal. This never repeats a value: each call is `max(Date.now(), last +
 * 1)`, so ordering by `created_at` alone is always correct, and the values
 * still read as real epoch milliseconds (only nudged forward under
 * contention, same trick a Lamport/HLC clock uses).
 */
let lastMonotonic = 0;
export function monotonicNow(): number {
	lastMonotonic = Math.max(Date.now(), lastMonotonic + 1);
	return lastMonotonic;
}

/** A row id. Lives here rather than in `room.ts` because `room.ts`, `image.ts` and `archive.ts` all insert rows and all used to keep a private copy of this one line. */
export function newId(): string {
	return crypto.randomUUID();
}
