/**
 * PER-TABLE THROTTLE — never per client IP (ADR-036: one venue router is one
 * IP, so an IP-keyed throttle would treat all 20 tables as one caller).
 *
 * A factory rather than a module-level singleton so `throttle.test.ts` gets
 * a fresh, isolated `Set` per test instead of leaking state between cases.
 *
 * **This is an optimisation, not a guarantee.** It lives in one isolate's
 * memory, and Cloudflare runs many isolates and recycles them without
 * warning — two near-simultaneous calls for the same table routinely land
 * on two of them and both acquire. An earlier version of this note claimed
 * "the real double-submit guard is the `UNIQUE(event_id, table_no, zone)`
 * constraint on `images`"; `IMAGE_SCHEMA` has no such constraint and never
 * did, so for a while the stated guard was fiction.
 *
 * The real guards are all in the database, and all single-statement:
 *   - `room.ts`'s `insertQueuedImageIfIdle` — `INSERT ... WHERE NOT EXISTS`,
 *     so a duplicate attempt is refused by the write itself.
 *   - `room.ts`'s `claimQueued` — the atomic `queued -> requested` that
 *     decides which ticker is allowed to call fal.
 *   - `limits.ts` + `getRenderBudget` — the cooldown and the per-table cap,
 *     both read from `image` rows rather than from memory.
 *
 * What this Set still earns: it collapses a genuine double-tap that happens
 * to land on one isolate before either call reaches D1, which saves a round
 * trip and gives the phone a better sentence than a race would.
 */
export function createThrottle() {
	const inFlight = new Set<number>();

	return {
		/** True and marks busy if this table has no generation in flight; false if it does. */
		acquire(table: number): boolean {
			if (inFlight.has(table)) return false;
			inFlight.add(table);
			return true;
		},
		release(table: number): void {
			inFlight.delete(table);
		},
		isBusy(table: number): boolean {
			return inFlight.has(table);
		}
	};
}

export type Throttle = ReturnType<typeof createThrottle>;
