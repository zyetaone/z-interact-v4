/**
 * PER-TABLE THROTTLE — never per client IP (ADR-036: one venue router is one
 * IP, so an IP-keyed throttle would treat all 20 tables as one caller).
 *
 * A factory rather than a module-level singleton so `throttle.test.ts` gets
 * a fresh, isolated `Map` per test instead of leaking state between cases.
 * In production a single instance is created once per isolate and imported
 * by `finishTable` — the Map is best-effort (an isolate restart clears it);
 * the real double-submit guard is the `UNIQUE(event_id, table_no, zone)`
 * constraint on `images` (see `room.ts`), which this only saves a wasted fal
 * call for.
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
