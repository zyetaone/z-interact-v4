/**
 * fal queue completion callback — the THIRD ticker (game-flow.md §6/§8),
 * alongside the phone poll (`answers.remote.ts`'s `tableStatus`) and the
 * admin poll (`admin.remote.ts`'s `roomLock`). It calls the exact same
 * `tickAndPersist` those do, with `GenerateDeps` that resolve immediately
 * from THIS payload instead of hitting fal's status/result endpoints again
 * — the webhook already has the finished image, so there's nothing to poll.
 *
 * Idempotency falls out of `tick()`'s own state guard: if this delivery
 * arrives twice, or arrives after a poller already advanced the row past
 * `requested`, `tickAndPersist` reads the row's CURRENT state and no-ops
 * (`generate.ts`'s "ticking a stored row is a no-op" rule) rather than
 * writing R2 or D1 a second time.
 */
import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import { envOf } from '$lib/server/env';
import { getImageById } from '$lib/server/room';
import { tickAndPersist } from '$lib/server/ticker';
import { falErrorText } from '$lib/server/fal';
import { imageKey, putImage } from '$lib/server/r2';
import type { RequestHandler } from './$types';

/** fal's own callback body shape (verified against fal.ai/docs/model-endpoints/queue) — fal does not echo back custom fields, so this app's own `image_id` cannot travel in here. */
const FalWebhookBody = v.object({
	request_id: v.string(),
	status: v.picklist(['OK', 'ERROR']),
	payload: v.optional(v.object({ images: v.optional(v.array(v.object({ url: v.string() }))) })),
	error: v.optional(v.string())
});

export const POST: RequestHandler = async ({ request, url, platform }) => {
	const env = envOf(platform);
	if (!env) return json({ ok: false, reason: 'no environment' }, { status: 503 });

	// ponytail: a shared-secret query token, not a verified fal signature.
	// Upgrade: verify fal's webhook signature (ed25519) once confirmed live
	// for this account — see fal's webhook docs.
	if (env.FAL_WEBHOOK_SECRET && url.searchParams.get('token') !== env.FAL_WEBHOOK_SECRET) {
		return json({ ok: false, reason: 'bad token' }, { status: 401 });
	}

	// This app's own row id travels as a query param on the webhook URL WE
	// built at submit time (`ticker.ts`'s `buildWebhookUrl`) — fal's callback
	// body only ever carries fal's own fields, never ours.
	const imageId = url.searchParams.get('image_id');
	if (!imageId) return json({ ok: false, reason: 'missing image_id' }, { status: 400 });

	const raw = await request.json().catch(() => null);
	const parsed = v.safeParse(FalWebhookBody, raw);
	if (!parsed.success) return json({ ok: false, reason: 'invalid body' }, { status: 400 });
	const body = parsed.output;

	const row = await getImageById(env.DB, imageId);
	if (!row) return json({ ok: false, reason: 'unknown image_id' }, { status: 404 });

	const imageUrl = body.status === 'OK' ? body.payload?.images?.[0]?.url : undefined;

	// waitUntil: return 200 to fal fast, let the R2 write continue after the
	// response (the doc's original rule; still correct now that the work is
	// routed through the shared ticker instead of a bespoke handler).
	platform?.context.waitUntil(
		tickAndPersist(
			env.DB,
			{
				id: row.id,
				state: row.state,
				falRequestId: row.falRequestId,
				createdAt: row.createdAt,
				table: row.table,
				zoneKey: row.zoneKey
			},
			// prompt text isn't needed for the requested->stored step this
			// webhook drives (generate.ts only reads it from the 'queued'
			// branch); passed through for type-shape completeness.
			'',
			{
				// The webhook always finds a row already `requested` (it was
				// queued and ticked once at submit time), so `submit` is never
				// called for a row this ticker reaches.
				async submit() {
					throw new Error('webhook ticker should never see a queued row');
				},
				async pollStatus() {
					// fal said the job is finished and it failed. Reporting that as
					// IN_PROGRESS (the pre-change behaviour) left the row `requested`
					// with nothing able to advance it; ERROR routes it to `failed`
					// through the shared ticker like any other terminal answer.
					if (body.status === 'ERROR') {
						return { status: 'ERROR' as const, error: falErrorText(body.error, 'ERROR') };
					}
					if (imageUrl) return { status: 'COMPLETED' as const };
					// status OK but no image in the payload — also terminal, not a wait.
					return { status: 'ERROR' as const, error: 'the image model returned no image' };
				},
				async fetchResult() {
					if (!imageUrl) throw new Error(falErrorText(body.error, 'ERROR'));
					return { imageUrl };
				},
				async fetchBytes(url) {
					const res = await fetch(url);
					if (!res.ok) throw new Error(`fetch image failed: ${res.status}`);
					return res.arrayBuffer();
				},
				async putR2(bytes) {
					const key = imageKey({ event: row.eventId, table: row.table, zone: row.zoneKey, imageId: row.id, ext: 'webp' });
					await putImage({ bucket: env.IMAGES, key, bytes, contentType: 'image/webp' });
					return { r2Key: key };
				}
			}
		)
	);

	return json({ ok: true });
};
