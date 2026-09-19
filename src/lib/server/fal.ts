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

/* -------------------------------------------------------------------------- */
/* DEV-ONLY FAKE — `FAL_FAKE=1 npm run dev`                                   */
/* -------------------------------------------------------------------------- */
/**
 * Additive: with `FAL_FAKE=1` the three calls below short-circuit so the
 * whole queued -> requested -> stored path runs, and screenshots have a
 * picture in them, without a fal key and without a network call. Never
 * reached in production, where the flag is unset.
 */
const FAKE_IMAGE =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAmUlEQVR42mMQkNQSldGSUtCWV9ZRUdfV0tbT19M3MTKwNDW0tzRysTX2dDDxczENcTeL9DaP87dgIEl1cpAlA0mqM8OsGEhSnRdpzUCS6uJYGwaSVFck2jKQpLouxY6BJNXNGfYMJKnuyHZgIEl1b74jA0mqJxc7MZCkekaZEwNJqudWOTOQpHpRrQsDSapXNLoykKR6basbAPW65K5ichrFAAAAAElFTkSuQmCC';

const FAKE_PREFIX = 'fake-';

function falFake(): boolean {
	return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.FAL_FAKE === '1';
}

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

/** The production model, the same slug the sibling apps use. */
export const FAL_MODEL = 'fal-ai/nano-banana-2';

export async function submitZoneImage(input: SubmitZoneImageInput): Promise<SubmitZoneImageResult> {
	if (falFake()) {
		const requestId = `${FAKE_PREFIX}${crypto.randomUUID()}`;
		return { requestId, statusUrl: '', responseUrl: '' };
	}
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
	if (requestId.startsWith(FAKE_PREFIX)) return { status: 'COMPLETED' };
	const res = await fetch(`https://queue.fal.run/${model}/requests/${requestId}/status`, {
		headers: { Authorization: `Key ${falKey}` }
	});
	if (!res.ok) throw new Error(`fal status failed: ${res.status}`);
	const body = (await res.json()) as { status: FalStatus['status']; queue_position?: number };
	return { status: body.status, queuePosition: body.queue_position };
}

/** The result payload once `status` reports COMPLETED. Shape is model-specific; `images[0].url` is the nano-banana-class convention this app targets. */
export async function fetchResult(falKey: string, model: string, requestId: string): Promise<{ imageUrl: string }> {
	if (requestId.startsWith(FAKE_PREFIX)) return { imageUrl: FAKE_IMAGE };
	const res = await fetch(`https://queue.fal.run/${model}/requests/${requestId}`, {
		headers: { Authorization: `Key ${falKey}` }
	});
	if (!res.ok) throw new Error(`fal result failed: ${res.status}`);
	const body = (await res.json()) as { images?: { url: string }[] };
	const imageUrl = body.images?.[0]?.url;
	if (!imageUrl) throw new Error('fal result had no image');
	return { imageUrl };
}
