/**
 * fal queue completion callback -> R2 + D1. Validates the body, checks the
 * shared-secret query token (ponytail: see module note below), then hands
 * off to `handleFalWebhook` (pure, tested in `webhook.test.ts`) inside
 * `platform.context.waitUntil` so the response returns fast.
 */
import { json } from '@sveltejs/kit';
import * as v from 'valibot';
import { FalWebhookBody, handleFalWebhook, type ImageRowRef } from '$lib/server/webhook';
import { envOf } from '$lib/server/env';
import { dbWith } from '$lib/server/d1';
import { IMAGES_SCHEMA } from '$lib/server/room';
import { imageKey } from '$lib/server/r2';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, url, platform }) => {
	const env = envOf(platform);
	if (!env) return json({ ok: false, reason: 'no environment' }, { status: 503 });

	// ponytail: a shared-secret query token, not a verified fal signature.
	// Upgrade: verify fal's webhook signature (ed25519) once it's confirmed
	// live for this account — see fal's webhook docs.
	if (env.FAL_WEBHOOK_SECRET && url.searchParams.get('token') !== env.FAL_WEBHOOK_SECRET) {
		return json({ ok: false, reason: 'bad token' }, { status: 401 });
	}

	const raw = await request.json().catch(() => null);
	const parsed = v.safeParse(FalWebhookBody, raw);
	if (!parsed.success) return json({ ok: false, reason: 'invalid body' }, { status: 400 });

	const db = await dbWith(env.DB, 'images', IMAGES_SCHEMA);
	if (!db) return json({ ok: false, reason: 'no db' }, { status: 503 });

	const work = handleFalWebhook(
		{
			async findByRequestId(requestId): Promise<ImageRowRef | null> {
				const row = await db
					.prepare(`SELECT event_id, table_no, zone, rev, status FROM images WHERE request_id = ?`)
					.bind(requestId)
					.first<{ event_id: string; table_no: number; zone: string; rev: number; status: string }>();
				if (!row) return null;
				return {
					eventId: row.event_id,
					table: row.table_no,
					zone: row.zone,
					rev: row.rev,
					status: row.status as ImageRowRef['status']
				};
			},
			async fetchBytes(imageUrl) {
				const res = await fetch(imageUrl);
				if (!res.ok) throw new Error(`fetch image failed: ${res.status}`);
				return res.arrayBuffer();
			},
			async putImage(ref, bytes) {
				const key = imageKey({ event: ref.eventId, table: ref.table, zone: ref.zone, rev: ref.rev, ext: 'webp' });
				await env.IMAGES.put(key, bytes, { httpMetadata: { contentType: 'image/webp' } });
				return { r2Key: key };
			},
			async markReady(requestId, r2Key, tileKey, madeAt) {
				await db
					.prepare(`UPDATE images SET status = 'ready', r2_key = ?, tile_key = ?, made_at = ? WHERE request_id = ?`)
					.bind(r2Key, tileKey ?? null, madeAt, requestId)
					.run();
			},
			async markFailed(requestId, reason) {
				console.log(`[fal-webhook] request ${requestId} failed: ${reason.slice(0, 200)}`);
				await db.prepare(`UPDATE images SET status = 'failed' WHERE request_id = ?`).bind(requestId).run();
			}
		},
		parsed.output
	);

	platform?.context.waitUntil(work);
	return json({ ok: true });
};
