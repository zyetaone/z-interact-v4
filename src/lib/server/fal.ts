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

/** fal's own enums, from the model's documented input schema (checked 2026-09-19, not recalled). */
export type FalAspectRatio = '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | 'auto';
export type FalResolution = '0.5K' | '1K' | '2K' | '4K';

/**
 * The model has NO `negative_prompt` field — verified against
 * fal.ai/models/fal-ai/nano-banana-2/api on 2026-09-19. Its documented
 * inputs are prompt, num_images, seed, aspect_ratio, output_format,
 * safety_tolerance, sync_mode, system_prompt, resolution, limit_generations,
 * enable_web_search, thinking_level. That is why the house negative rides
 * inside the prompt as an `Avoid: ...` clause (`prompt.ts`'s
 * `negativeClause`): an unrecognised field would be accepted and silently
 * dropped, which is the failure mode where the negative looks applied and
 * is not.
 */
export interface SubmitZoneImageInput {
	falKey: string;
	model: string;
	/** Already carries the zone suffix and the `Avoid: ...` negative clause — see `layers.ts`'s `composeZonePrompt`. */
	prompt: string;
	/** Reference images for the edit endpoint. When present this submits to `<model>/edit` with `image_urls`. Must be ABSOLUTE — fal fetches them. */
	referenceUrls?: string[];
	aspectRatio?: FalAspectRatio;
	resolution?: FalResolution;
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

/** A wall, not a phone. Every zone render is shown full-bleed on a 16:9 panel or larger. */
export const DEFAULT_ASPECT_RATIO: FalAspectRatio = '16:9';

/**
 * fal's own default. Raised per event via `FAL_RESOLUTION` rather than
 * here, because it is the single biggest cost lever in the app and doubling
 * spend is the desk's call, not a default. `2K` is the one to reach for if
 * the LED wall shows a tile larger than about 1,500px wide.
 */
export const DEFAULT_RESOLUTION: FalResolution = '1K';

/** Parses `FAL_RESOLUTION`, falling back to the default on anything unrecognised rather than passing a value fal would reject. */
export function resolutionFrom(raw: string | undefined): FalResolution {
	const allowed: FalResolution[] = ['0.5K', '1K', '2K', '4K'];
	return allowed.find((r) => r === raw) ?? DEFAULT_RESOLUTION;
}

export async function submitZoneImage(input: SubmitZoneImageInput): Promise<SubmitZoneImageResult> {
	if (falFake()) {
		const requestId = `${FAKE_PREFIX}${crypto.randomUUID()}`;
		return { requestId, statusUrl: '', responseUrl: '' };
	}
	// With references this is image-to-image: a DIFFERENT endpoint
	// (`<model>/edit`) taking `image_urls`. The queue, status, result and
	// webhook shapes are identical, so nothing downstream changes.
	const references = input.referenceUrls?.filter((u) => !!u) ?? [];
	const endpoint = references.length ? `${input.model}/edit` : input.model;

	const url = new URL(`https://queue.fal.run/${endpoint}`);
	if (input.webhookUrl) url.searchParams.set('fal_webhook', input.webhookUrl);

	const requestBody: Record<string, unknown> = {
		prompt: input.prompt,
		aspect_ratio: input.aspectRatio ?? DEFAULT_ASPECT_RATIO,
		resolution: input.resolution ?? DEFAULT_RESOLUTION,
		output_format: 'png',
		...(references.length ? { image_urls: references } : {}),
		...(input.retentionSeconds ? { sync_mode: false, retention: input.retentionSeconds } : {}),
		metadata: { requestKey: input.requestKey }
	};

	const res = await fetch(url.toString(), {
		method: 'POST',
		headers: {
			Authorization: `Key ${input.falKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(requestBody)
	});
	if (!res.ok) {
		throw new Error(await httpFailure('fal submit', res));
	}
	const body = (await res.json()) as { request_id: string; status_url: string; response_url: string };
	return { requestId: body.request_id, statusUrl: body.status_url, responseUrl: body.response_url };
}

/**
 * fal's own status vocabulary is `IN_QUEUE` / `IN_PROGRESS` / `COMPLETED`.
 * A failure surfaces either as the webhook body's `ERROR` status or as an
 * `error`/`detail` payload alongside some other string. `ERROR` is this
 * app's fifth value for "the provider is finished and it did not work" —
 * without it `generate.ts`'s `requested` branch reads every unrecognised
 * status as "not ready yet" and the row waits for ever.
 */
export type FalStatusName = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'ERROR';

export interface FalStatus {
	status: FalStatusName;
	queuePosition?: number;
	/** Short provider-side reason. Only set when `status` is `ERROR`. */
	error?: string;
}

/**
 * The unknown-status rule, split out so `fal.test.ts` drives it with no
 * network call. Anything that is not one of fal's three live states is an
 * ERROR — an unmodelled status is a row nobody can advance, which is the
 * failure mode this whole change exists to remove.
 */
export function normaliseStatus(body: {
	status?: unknown;
	queue_position?: number;
	error?: unknown;
	detail?: unknown;
}): FalStatus {
	const status = body.status;
	if (status === 'IN_QUEUE' || status === 'IN_PROGRESS') {
		return { status, queuePosition: body.queue_position };
	}
	if (status === 'COMPLETED') return { status: 'COMPLETED' };
	return { status: 'ERROR', error: falErrorText(body.error ?? body.detail, status) };
}

/** A short, human-readable reason from whatever shape fal put the failure in. */
export function falErrorText(detail: unknown, status?: unknown): string {
	if (typeof detail === 'string' && detail.trim()) return detail.trim().slice(0, 200);
	if (detail != null) {
		try {
			return JSON.stringify(detail).slice(0, 200);
		} catch {
			/* fall through to the status-based wording */
		}
	}
	if (typeof status === 'string' && status.trim()) return `the image model reported ${status.trim()}`.slice(0, 200);
	return 'the image model reported an error';
}

/**
 * WHERE THE REASON ACTUALLY LIVES.
 *
 * fal's STATUS endpoint reports that a request failed, but its payload is
 * often a single thin line — table 9's plaza row stored the whole of what
 * fal gave it: `Unexpected status code: 422`. That is already the
 * provider's own words, not a truncation on our side, which is why the
 * body-capture fix did not improve it: there was no richer body at that
 * endpoint to capture.
 *
 * The RESULT endpoint for the same request usually carries the detail —
 * the validation message, the rejected field. One extra request, only on
 * the error path, to turn a status code into something a person can act
 * on.
 */
async function failureDetail(falKey: string, model: string, requestId: string): Promise<string> {
	try {
		const res = await fetch(`https://queue.fal.run/${model}/requests/${requestId}`, {
			headers: { Authorization: `Key ${falKey}` }
		});
		return (await res.text()).trim().slice(0, 300);
	} catch {
		// Diagnosis must never be able to fail the thing it is diagnosing.
		return '';
	}
}

export async function pollStatus(falKey: string, model: string, requestId: string): Promise<FalStatus> {
	if (requestId.startsWith(FAKE_PREFIX)) return { status: 'COMPLETED' };
	const res = await fetch(`https://queue.fal.run/${model}/requests/${requestId}/status`, {
		headers: { Authorization: `Key ${falKey}` }
	});
	if (!res.ok) throw new Error(await httpFailure('fal status', res));
	const body = (await res.json()) as { status?: unknown; queue_position?: number; error?: unknown; detail?: unknown };
	const status = normaliseStatus(body);
	if (status.status !== 'ERROR') return status;

	const thin = status.error ?? '';
	const detail = await failureDetail(falKey, model, requestId);
	// Nothing to add, or the same line twice: a doubled message reads like
	// two separate failures on the desk.
	if (!detail || thin.includes(detail) || detail.includes(thin)) return status;
	return { status: 'ERROR', error: `${thin} — ${detail}`.slice(0, 400) };
}

/**
 * An opaque `fal result failed: 422` is what four of twelve requests left
 * behind in the fidelity run — a status code with no reason, stored in the
 * error column and shown to the table. fal puts the reason in the body, so
 * read it.
 */
export async function httpFailure(what: string, res: Response): Promise<string> {
	const text = await res.text().catch(() => '');
	return `${what} failed: ${res.status}${text ? ` ${text.slice(0, 300)}` : ''}`;
}

/**
 * Statuses that say something about the ACCOUNT rather than the request.
 * A second identical submit cannot fix any of them, and trying costs a
 * live table another tick of watching a picture that is not coming.
 *
 * 402 and 403 are the ones that bite: the fal balance ran out mid-event
 * and every submit came back `403 User is locked`. The room does not need
 * that discovered twice per zone.
 */
const TERMINAL_STATUSES = new Set([401, 402, 403, 404]);

/**
 * True for a fal failure worth ONE fresh submit — the 422s in the fidelity
 * run cleared on a retry for other tables in the same run, which is what a
 * wobble looks like. An auth or balance refusal is not a wobble; it is an
 * answer, and it goes straight to `failed` so the tile shows it.
 */
export function isRetryableFailure(message: string): boolean {
	const m = /failed: (\d{3})/.exec(message);
	if (!m) return false;
	const status = Number(m[1]);
	if (TERMINAL_STATUSES.has(status)) return false;
	return status >= 400 && status < 600;
}

/** The result payload once `status` reports COMPLETED. Shape is model-specific; `images[0].url` is the nano-banana-class convention this app targets. */
export async function fetchResult(falKey: string, model: string, requestId: string): Promise<{ imageUrl: string }> {
	if (requestId.startsWith(FAKE_PREFIX)) return { imageUrl: FAKE_IMAGE };
	const res = await fetch(`https://queue.fal.run/${model}/requests/${requestId}`, {
		headers: { Authorization: `Key ${falKey}` }
	});
	if (!res.ok) throw new Error(await httpFailure('fal result', res));
	const body = (await res.json()) as { images?: { url: string }[] };
	const imageUrl = body.images?.[0]?.url;
	if (!imageUrl) throw new Error('fal result had no image');
	return { imageUrl };
}
