/**
 * fal WEBHOOK HANDLER — pure logic, dependencies injected.
 *
 * `webhook.test.ts` exercises this with in-memory fakes: no D1, no R2, no
 * real HTTP. The `+server.ts` route (`routes/api/fal-webhook/+server.ts`) is
 * a thin adapter that resolves the real `Env`, builds the real deps, and
 * calls this inside `platform.context.waitUntil`.
 *
 * Idempotency: `UNIQUE(request_id)` on `images` (see `room.ts`) plus a
 * status check here — a webhook fal (or a flaky network) delivers twice
 * finds the row already `ready` and returns `{ handled: false }` without a
 * second R2 write.
 */
import * as v from 'valibot';

export const FalWebhookBody = v.object({
	request_id: v.string(),
	status: v.picklist(['OK', 'ERROR']),
	payload: v.optional(v.object({ images: v.optional(v.array(v.object({ url: v.string() }))) })),
	error: v.optional(v.string())
});
export type FalWebhookBody = v.InferOutput<typeof FalWebhookBody>;

export interface ImageRowRef {
	eventId: string;
	table: number;
	zone: string;
	rev: number;
	status: 'pending' | 'ready' | 'failed';
}

export interface WebhookDeps {
	findByRequestId(requestId: string): Promise<ImageRowRef | null>;
	fetchBytes(url: string): Promise<ArrayBuffer>;
	putImage(ref: ImageRowRef, bytes: ArrayBuffer): Promise<{ r2Key: string; tileKey?: string }>;
	markReady(requestId: string, r2Key: string, tileKey: string | undefined, madeAt: number): Promise<void>;
	markFailed(requestId: string, reason: string): Promise<void>;
}

export interface WebhookResult {
	handled: boolean;
	reason?: string;
}

export async function handleFalWebhook(deps: WebhookDeps, body: FalWebhookBody): Promise<WebhookResult> {
	const row = await deps.findByRequestId(body.request_id);
	if (!row) return { handled: false, reason: 'unknown request_id' };
	if (row.status !== 'pending') return { handled: false, reason: `already ${row.status}` };

	if (body.status === 'ERROR') {
		await deps.markFailed(body.request_id, body.error ?? 'fal reported ERROR');
		return { handled: true };
	}

	const imageUrl = body.payload?.images?.[0]?.url;
	if (!imageUrl) {
		await deps.markFailed(body.request_id, 'fal payload had no image');
		return { handled: true };
	}

	const bytes = await deps.fetchBytes(imageUrl);
	const { r2Key, tileKey } = await deps.putImage(row, bytes);
	await deps.markReady(body.request_id, r2Key, tileKey, Date.now());
	return { handled: true };
}
