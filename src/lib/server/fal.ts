/**
 * fal queue API over raw `fetch` — no `@fal-ai/client` (architecture doc §1:
 * every sibling app calls `fal.run`/`queue.fal.run` directly; the SDK is a
 * dependency for two HTTP calls). URL shapes and the `fal_webhook` query
 * param verified against https://fal.ai/docs/model-endpoints/queue on
 * 2026-09-19, not from memory.
 *
 * Retention is an explicit parameter on every submit call, never a package
 * default — `monorepo-proposal.md` §5 flagged a default-retention footgun.
 * Practically it does little here: the webhook pulls bytes into R2 the
 * moment it fires, so fal's own expiry never has a chance to matter, but the
 * caller still has to say so.
 *
 * The key is read from `Env.FAL_KEY` by the caller and passed in — this
 * module never reads `env` itself, and never logs the key.
 */

export interface SubmitZoneImageInput {
	falKey: string;
	model: string;
	prompt: string;
	/** Absolute webhook URL, already carrying the shared-secret token query param. */
	webhookUrl?: string;
	/** fal's own result retention. Explicit — see module note. */
	retentionSeconds?: number;
	/** Idempotency: this app's own key (`${table}:${zone}`), sent through as metadata, not fal's request_id. */
	requestKey: string;
}

export interface SubmitZoneImageResult {
	requestId: string;
	statusUrl: string;
	responseUrl: string;
}

export async function submitZoneImage(input: SubmitZoneImageInput): Promise<SubmitZoneImageResult> {
	const url = new URL(`https://queue.fal.run/${input.model}`);
	if (input.webhookUrl) url.searchParams.set('fal_webhook', input.webhookUrl);

	const res = await fetch(url.toString(), {
		method: 'POST',
		headers: {
			Authorization: `Key ${input.falKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			prompt: input.prompt,
			...(input.retentionSeconds ? { sync_mode: false, retention: input.retentionSeconds } : {}),
			metadata: { requestKey: input.requestKey }
		})
	});
	if (!res.ok) {
		throw new Error(`fal submit failed: ${res.status} ${await res.text().catch(() => '')}`);
	}
	const body = (await res.json()) as { request_id: string; status_url: string; response_url: string };
	return { requestId: body.request_id, statusUrl: body.status_url, responseUrl: body.response_url };
}

export interface FalStatus {
	status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED';
	queuePosition?: number;
}

export async function pollStatus(falKey: string, model: string, requestId: string): Promise<FalStatus> {
	const res = await fetch(`https://queue.fal.run/${model}/requests/${requestId}/status`, {
		headers: { Authorization: `Key ${falKey}` }
	});
	if (!res.ok) throw new Error(`fal status failed: ${res.status}`);
	const body = (await res.json()) as { status: FalStatus['status']; queue_position?: number };
	return { status: body.status, queuePosition: body.queue_position };
}

/** The result payload once `status` reports COMPLETED. Shape is model-specific; `images[0].url` is the nano-banana-class convention this app targets. */
export async function fetchResult(falKey: string, model: string, requestId: string): Promise<{ imageUrl: string }> {
	const res = await fetch(`https://queue.fal.run/${model}/requests/${requestId}`, {
		headers: { Authorization: `Key ${falKey}` }
	});
	if (!res.ok) throw new Error(`fal result failed: ${res.status}`);
	const body = (await res.json()) as { images?: { url: string }[] };
	const imageUrl = body.images?.[0]?.url;
	if (!imageUrl) throw new Error('fal result had no image');
	return { imageUrl };
}
