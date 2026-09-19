/**
 * GENERATION — a resumable state machine, not fire-and-forget.
 *
 * `queued -> requested(fal_request_id) -> stored -> done`, plus `failed`.
 * `waitUntil` kicks the first tick; the phone's status poll, the admin poll,
 * and the fal webhook route are each ANOTHER ticker calling the same
 * `tick()` — that is what makes regenerate, dead-phone recovery and
 * double-submit fall out for free instead of each needing its own path
 * (game-flow.md §6, §8).
 *
 * `tick()` is pure aside from its injected `GenerateDeps` — no D1/R2/fetch
 * import in this file — so `generate.test.ts` exercises every transition,
 * including the idempotency guarantee: ticking a row that is already
 * `stored`, `done` or `failed` does nothing and calls no dependency. That
 * same guard is what makes a duplicate fal webhook delivery, or a phone
 * poll racing an admin poll, safe — whichever ticker gets there first wins,
 * and every other caller's tick is a no-op.
 *
 * ponytail: the `stored -> done` step (tile generation, see `r2.ts`'s
 * module note) is not implemented. `stored` is therefore the de facto
 * terminal success state today — the table/projector already only have a
 * full-size image to show (no tile exists yet), so nothing downstream is
 * blocked by `done` never being reached. Wiring a real resizer is the
 * upgrade that makes `stored -> done` a real transition instead of a no-op.
 */

export type GenerationState = 'queued' | 'requested' | 'stored' | 'done' | 'failed';

/**
 * How long a `requested` row may sit with no fal request id before it is
 * given up on. That combination means a ticker CLAIMED the row (see
 * `room.ts`'s `claimQueued`) and then died before its submit landed — rare,
 * but the price of claiming before spending. Without this the row reads as
 * "cannot resume" for ever, which is the same stuck table the claim exists
 * to prevent. Two minutes is comfortably longer than a submit round-trip.
 */
export const STALE_CLAIM_MS = 2 * 60 * 1000;

export interface GenerationRow {
	id: string;
	state: GenerationState;
	falRequestId: string | null;
	/** When this attempt's row was inserted — the claim happens moments later, so it doubles as the claim clock for `STALE_CLAIM_MS`. */
	createdAt?: number;
	/** The composed prompt this attempt submits. Set at insert time (queued), never changed by tick(). */
	prompt: string;
	/** This app's own idempotency/logging key — `${table}:${zone}:${imageId}` is a reasonable default for a caller to use. */
	requestKey: string;
}

/** The subset of `fal.ts`'s `FalStatus` this state machine reads. `ERROR` is a real, terminal answer — see `fal.ts`'s note on why it has to be modelled. */
export interface PolledStatus {
	status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'ERROR';
	error?: string;
}

export interface GenerateDeps {
	submit(prompt: string, requestKey: string): Promise<{ requestId: string }>;
	pollStatus(requestId: string): Promise<PolledStatus>;
	fetchResult(requestId: string): Promise<{ imageUrl: string }>;
	fetchBytes(imageUrl: string): Promise<ArrayBuffer>;
	putR2(bytes: ArrayBuffer): Promise<{ r2Key: string }>;
}

export type TickResult =
	| { handled: true; nextState: 'requested'; falRequestId: string }
	| { handled: true; nextState: 'stored'; r2Key: string }
	| { handled: true; nextState: 'failed'; reason: string }
	| { handled: false; reason: string };

/**
 * Advances one generation row by exactly one step, or reports why it
 * couldn't. Never throws on a fal/network failure — callers should treat a
 * thrown error from `deps` as the caller's job to catch and mark `failed`
 * (see `markFailed` below), so a transient wobble doesn't wedge the row.
 */
export async function tick(row: GenerationRow, deps: GenerateDeps, now: number = Date.now()): Promise<TickResult> {
	switch (row.state) {
		case 'queued': {
			const { requestId } = await deps.submit(row.prompt, row.requestKey);
			return { handled: true, nextState: 'requested', falRequestId: requestId };
		}
		case 'requested': {
			if (!row.falRequestId) {
				// Claimed, then the claimer died before its submit landed. Wait a
				// little (a submit in flight looks identical), then fail it so the
				// table can draw again instead of watching a row nobody owns.
				if (row.createdAt != null && now - row.createdAt > STALE_CLAIM_MS) {
					return {
						handled: true,
						nextState: 'failed',
						reason: 'the drawing was claimed but never sent — draw again'
					};
				}
				return { handled: false, reason: 'requested with no fal_request_id — cannot resume' };
			}
			const status = await deps.pollStatus(row.falRequestId);
			// A provider-side failure is an ANSWER, not a "not yet". Reporting it
			// as `handled: false` (the pre-change behaviour for every non-COMPLETED
			// status) left the row `requested` for ever with no ticker able to
			// move it, which showed up as a table stuck on the Drawing screen.
			if (status.status === 'ERROR') {
				return {
					handled: true,
					nextState: 'failed',
					reason: (status.error ?? 'the image model reported an error').slice(0, 200)
				};
			}
			if (status.status !== 'COMPLETED') {
				return { handled: false, reason: `fal status is ${status.status}, not ready yet` };
			}
			const { imageUrl } = await deps.fetchResult(row.falRequestId);
			const bytes = await deps.fetchBytes(imageUrl);
			const { r2Key } = await deps.putR2(bytes);
			return { handled: true, nextState: 'stored', r2Key };
		}
		case 'stored':
		case 'done':
		case 'failed':
			// See module note: stored/done/failed are all terminal for this
			// scaffold (no tile step implemented). No dependency is called.
			return { handled: false, reason: `${row.state}: nothing to do` };
	}
}

/** True for a row a ticker should skip entirely rather than call `tick()` on — same test as the switch above, exposed for callers that batch-tick many rows. */
export function isTerminal(state: GenerationState): boolean {
	return state === 'stored' || state === 'done' || state === 'failed';
}
