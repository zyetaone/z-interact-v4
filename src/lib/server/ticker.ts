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
import { claimQueued, markRequested, markStored, markFailed } from './room';
import { FAL_MODEL, submitZoneImage, pollStatus as pollFalStatus, fetchResult as fetchFalResult } from './fal';
import { imageKey, putImage } from './r2';
import { extForContentType, fetchImageBytes } from './fetch-image';

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
	env: Pick<Env, 'FAL_KEY' | 'IMAGES' | 'FAL_WEBHOOK_SECRET'>,
	event: string,
	table: number,
	zone: string,
	imageId: string,
	webhookUrl?: string
): GenerateDeps {
	const falKey = env.FAL_KEY ?? '';
	const model = FAL_MODEL;
	return {
		async submit(prompt, requestKey) {
			const { requestId } = await submitZoneImage({
				falKey,
				model,
				prompt,
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
		await markFailed(db, row.id, String(e).slice(0, 500));
	}
}
