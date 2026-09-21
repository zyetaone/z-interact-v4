/**
 * THE SHARED TICKER — one implementation of "advance one generation row by
 * one step and persist the result", called from three places (game-flow.md
 * §6, §8): the phone's `tableStatus` poll, the admin poll, and the fal
 * webhook route. `waitUntil` (see `env.ts`'s `requestWaitUntil`) is what
 * kicks the very first tick after `finishTable`; all three tickers are the
 * safety net that resumes a row if that kick was cut short, and none of
 * them needs its own recovery path because they all call this.
 *
 * `realGenerateDeps` wires `generate.ts`'s `tick()` to the real fal/R2 I/O.
 * The webhook route builds its OWN deps instead (its payload already has
 * the finished image; there's nothing to poll), then calls this same
 * `tickAndPersist` — that's what makes "the webhook route is one more
 * ticker" literally true rather than a separate code path with its own
 * idempotency story. `tick()`'s own state guard (a no-op on anything but
 * `queued`/`requested`) is what makes a duplicate webhook delivery safe.
 */
import type { Env } from './env';
import { tick, isTerminal, type GenerateDeps, type GenerationState } from './generate';
import {
	claimQueued,
	markRequested,
	markStored,
	markFailed,
	retryImage,
	getCurrentImage,
	setImageReferences
} from './room';
import {
	FAL_MODEL,
	submitZoneImage,
	isRetryableFailure,
	resolutionFrom,
	pollStatus as pollFalStatus,
	fetchResult as fetchFalResult
} from './fal';
import { imageKey, putImage } from './r2';
import { extForContentType, fetchImageBytes } from './fetch-image';
import { ANCHOR_ZONE, absoluteUrl, decideReferences, referenceModeFrom, withReferenceInstruction } from './reference';
import { lensImagePath } from '$lib/game/visuals';

/** Builds this app's own webhook URL for one image row — `image_id` is how the webhook route finds the D1 row (fal's own `request_id` isn't known until after submit). Returns undefined if the caller has no origin (outside a request, or the secret isn't set) so callers fall back to poll-only. */
export function buildWebhookUrl(origin: string | undefined, secret: string | undefined, imageId: string): string | undefined {
	// No origin: outside a request, nothing to call back to.
	// No secret: the route now FAILS CLOSED, so a token-less callback would
	// 401 on arrival. Returning undefined makes that explicit — the row is
	// poll-only, which is a supported mode, rather than push-registered to an
	// endpoint that will reject every delivery.
	if (!origin || !secret) return undefined;
	const url = new URL('/api/fal-webhook', origin);
	url.searchParams.set('image_id', imageId);
	url.searchParams.set('token', secret);
	return url.toString();
}

export interface TickableImageRow {
	id: string;
	state: string;
	falRequestId: string | null;
	table: number;
	zoneKey: string;
	/** Insert time of this attempt — `generate.ts` reads it to give up on a claim whose owner died. Optional so the webhook, which never sees a `queued` row, need not carry it. */
	createdAt?: number;
}

/** The real fal + R2 backed deps — used by the phone/admin pollers. `webhookUrl`, when the caller can build one (see `env.ts`'s `requestOrigin`), registers this app's `/api/fal-webhook` as fal's push notification for this submit — the poll-based deps above still resume the row if that push never arrives. */
export function realGenerateDeps(
	env: Pick<Env, 'FAL_KEY' | 'IMAGES' | 'FAL_WEBHOOK_SECRET' | 'FAL_RESOLUTION' | 'REFERENCE_MODE'>,
	event: string,
	table: number,
	zone: string,
	imageId: string,
	webhookUrl?: string,
	/** Absolute URLs. When present, `submitZoneImage` uses the edit endpoint so the render is anchored to the lens picture. */
	referenceUrls?: string[]
): GenerateDeps {
	const falKey = env.FAL_KEY ?? '';
	const model = FAL_MODEL;
	return {
		async submit(prompt, requestKey) {
			const { requestId } = await submitZoneImage({
				falKey,
				model,
				prompt,
				referenceUrls,
				resolution: resolutionFrom(env.FAL_RESOLUTION),
				requestKey,
				retentionSeconds: 60 * 60 * 24,
				webhookUrl
			});
			return { requestId };
		},
		async pollStatus(requestId) {
			return pollFalStatus(falKey, model, requestId);
		},
		async fetchResult(requestId) {
			return fetchFalResult(falKey, model, requestId);
		},
		async fetchBytes(imageUrl) {
			// Same guards as the webhook: allow-listed host, capped bytes, a real
			// image type. The poll path reaches a fal-supplied URL rather than an
			// attacker-supplied one, but it is the same code either way.
			return fetchImageBytes(imageUrl);
		},
		async putR2({ bytes, contentType }) {
			const key = imageKey({ event, table, zone, imageId, ext: extForContentType(contentType) });
			await putImage({ bucket: env.IMAGES, key, bytes, contentType });
			return { r2Key: key };
		}
	};
}

/**
 * Advances one row by one tick and persists the transition, or marks it
 * `failed` if a dependency throws (a transient fal/network wobble should
 * not wedge a row silently forever). `prompt` is the composed prompt text
 * this attempt submits — callers read it from the `prompt` table by the
 * image row's `promptId` (TODO(content) until that read path is wired
 * end-to-end; see `answers.remote.ts`'s inline note).
 */
export async function tickAndPersist(
	db: D1Database,
	row: TickableImageRow,
	prompt: string,
	deps: GenerateDeps
): Promise<void> {
	if (isTerminal(row.state as GenerationState)) return;

	// CLAIM FIRST, SPEND SECOND. `row.state` is a snapshot this caller read
	// some time ago; two tickers routinely hold the same `queued` snapshot.
	// `claimQueued` is the atomic `queued -> requested` that decides which of
	// them is allowed to call fal at all. Losing is the normal case, not an
	// error — the winner is already generating this exact row.
	if (row.state === 'queued') {
		if (!(await claimQueued(db, row.id))) return;
	}

	try {
		const result = await tick(
			{
				id: row.id,
				state: row.state as GenerationState,
				falRequestId: row.falRequestId,
				createdAt: row.createdAt,
				prompt,
				requestKey: `${row.table}:${row.zoneKey}:${row.id}`
			},
			deps
		);
		if (!result.handled) return;
		if (result.nextState === 'requested') await markRequested(db, row.id, result.falRequestId);
		else if (result.nextState === 'stored') await markStored(db, row.id, result.r2Key);
		// A provider-reported failure reaches `failed` through the same write
		// as a thrown dependency below — a visibly failed tile, not a row that
		// sits in `requested` until the event ends.
		else if (result.nextState === 'failed') await markFailed(db, row.id, result.reason);
	} catch (e) {
		const reason = String(e).slice(0, 500);
		// ONE fresh submit on a provider-side HTTP failure. The fidelity run
		// lost four of twelve requests to an opaque 422 — one table's whole
		// set, moments after another table succeeded 4/4 — which reads as a
		// wobble, not a bad prompt. `retryImage` is bounded by `attempt`, so a
		// row that keeps failing still fails visibly.
		if (isRetryableFailure(reason) && (await retryImage(db, row.id))) return;
		await markFailed(db, row.id, reason);
	}
}

/* -------------------------------------------------------------------------- */
/* THE ONE ENTRY POINT every ticker uses.                                     */
/*                                                                            */
/* Three tickers (phone poll, admin poll, the `waitUntil` kick) each used to  */
/* build their own deps and call `tickAndPersist` directly, which is how the  */
/* admin ticker drifted into submitting a zone-less prompt with no webhook.   */
/* The style anchor adds a DEPENDENCY between rows — zones 2-4 wait for zone  */
/* 1 — and a rule that three callers each have to remember is a rule that     */
/* one of them will forget. So it lives here, once.                           */
/* -------------------------------------------------------------------------- */

export interface TickContext {
	db: D1Database;
	env: Pick<Env, 'FAL_KEY' | 'IMAGES' | 'FAL_WEBHOOK_SECRET' | 'FAL_RESOLUTION' | 'REFERENCE_MODE'>;
	event: string;
	/** The request's own origin. References must be absolute — fal fetches them itself. */
	origin: string | undefined;
	/** The future this table chose, for its lens picture. Null falls back to text-to-image. */
	futureKey: string | null;
	/** The table's reset watermark, so a pre-reset anchor is not used as a reference. */
	since?: number;
	now?: number;
}

/**
 * Advances one row, honouring the style anchor. Returns what it did, which
 * is what the tests read — a skipped row is a normal outcome, not an error.
 */
/**
 * ONE ZONE'S FAILURE MUST NOT TAKE THE POLL WITH IT.
 *
 * The three tickers all walk a list of rows. If a tick throws anywhere
 * outside `tickAndPersist`'s own catch, the loop stops and — for the
 * phone, where the loop is inside the `tableStatus` query — the whole poll
 * rejects. The screen then keeps rendering its last good snapshot, which
 * says "being drawn", and shows no error at all, while the rows behind it
 * are never advanced by that ticker again.
 *
 * That is the shape of the stuck table seen on the night: three zones in
 * "being drawn" indefinitely with nothing on the phone to say why. So the
 * boundary is explicit: a tick that throws is one row's problem, reported
 * as a reason like any other refusal, and the next row still gets its turn.
 */
export async function tickRowSafely(
	ctx: TickContext,
	row: TickableImageRow,
	prompt: string
): Promise<{ ticked: boolean; reason: string }> {
	try {
		return await tickImageRow(ctx, row, prompt);
	} catch (e) {
		return { ticked: false, reason: `tick threw: ${String(e).slice(0, 200)}` };
	}
}

export async function tickImageRow(ctx: TickContext, row: TickableImageRow, prompt: string): Promise<{ ticked: boolean; reason: string }> {
	const now = ctx.now ?? Date.now();

	// Only a row about to be SUBMITTED needs references. A `requested` row is
	// already at fal; re-deciding its anchor would be meaningless and would
	// make a zone that is mid-render look blocked.
	if (row.state !== 'queued') {
		await tickAndPersist(ctx.db, row, prompt, realGenerateDeps(ctx.env, ctx.event, row.table, row.zoneKey, row.id, buildWebhookUrl(ctx.origin, ctx.env.FAL_WEBHOOK_SECRET, row.id)));
		return { ticked: true, reason: 'advancing an in-flight row' };
	}

	const mode = referenceModeFrom(ctx.env.REFERENCE_MODE);
	const lensUrl = absoluteUrl(ctx.origin, lensImagePath(ctx.futureKey));

	// The anchor zone's own row, read fresh — another ticker may have stored
	// it since this caller took its snapshot. Only `chain` needs it, so the
	// other two modes skip this read entirely and never serialise a table
	// behind its first zone.
	let anchorUrl: string | null = null;
	let anchorSettled = false;
	if (mode === 'chain' && row.zoneKey !== ANCHOR_ZONE) {
		const anchor = await getCurrentImage(ctx.db, ctx.event, row.table, ANCHOR_ZONE);
		const fresh = anchor && anchor.createdAt > (ctx.since ?? 0);
		if (fresh && anchor.r2Key && (anchor.state === 'stored' || anchor.state === 'done')) {
			// Served through the projector's own public, event-scoped R2 proxy —
			// the one route fal can already reach.
			anchorUrl = absoluteUrl(ctx.origin, `/projector/img/${anchor.r2Key}`);
		}
		// No anchor row at all counts as settled: nothing is coming.
		anchorSettled = !fresh || anchor.state === 'failed';
	}

	const decision = decideReferences(row.zoneKey, {
		anchorUrl,
		anchorSettled,
		queuedAt: row.createdAt ?? now,
		now,
		lensUrl
	}, mode);
	if (!decision.ready) return { ticked: false, reason: decision.reason };

	if (decision.referenceUrls.length) await setImageReferences(ctx.db, row.id, decision.referenceUrls);

	await tickAndPersist(
		ctx.db,
		row,
		// Added at SUBMIT, not at compose: the stored prompt stays the table's
		// own brief (what the desk shows, what a per-zone retry replays), and
		// the instruction is re-added by this same path on every resubmit,
		// so a retry cannot lose it.
		withReferenceInstruction(prompt, decision.referenceUrls),
		realGenerateDeps(
			ctx.env,
			ctx.event,
			row.table,
			row.zoneKey,
			row.id,
			buildWebhookUrl(ctx.origin, ctx.env.FAL_WEBHOOK_SECRET, row.id),
			decision.referenceUrls
		)
	);
	return { ticked: true, reason: decision.reason };
}
