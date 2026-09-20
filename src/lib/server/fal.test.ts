/**
 * The unknown-status rule. fal's live vocabulary is IN_QUEUE / IN_PROGRESS /
 * COMPLETED; everything else has to read as ERROR, because the alternative
 * (the pre-change behaviour) is a row no ticker can ever advance.
 */
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ASPECT_RATIO, FAL_MODEL, falErrorText, httpFailure, isRetryableFailure, normaliseStatus, pollStatus, resolutionFrom, submitZoneImage } from './fal';

describe('normaliseStatus', () => {
	it('passes fal\'s three live states through unchanged', () => {
		expect(normaliseStatus({ status: 'IN_QUEUE', queue_position: 3 })).toEqual({
			status: 'IN_QUEUE',
			queuePosition: 3
		});
		expect(normaliseStatus({ status: 'IN_PROGRESS' })).toEqual({ status: 'IN_PROGRESS', queuePosition: undefined });
		expect(normaliseStatus({ status: 'COMPLETED' })).toEqual({ status: 'COMPLETED' });
	});

	it('reads an explicit ERROR status as ERROR and keeps its reason', () => {
		const out = normaliseStatus({ status: 'ERROR', error: 'content policy' });
		expect(out.status).toBe('ERROR');
		expect(out.error).toBe('content policy');
	});

	it('reads an UNMODELLED status as ERROR rather than "not ready yet"', () => {
		// The exact regression: a status string this app has never seen used to
		// fall through the `!== 'COMPLETED'` branch as a wait, for ever.
		const out = normaliseStatus({ status: 'CANCELLED' });
		expect(out.status).toBe('ERROR');
		expect(out.error).toContain('CANCELLED');
	});

	it('reads a missing status with an error payload as ERROR', () => {
		const out = normaliseStatus({ detail: 'invalid model id' });
		expect(out).toEqual({ status: 'ERROR', error: 'invalid model id' });
	});

	it('caps the reason so an upstream error can never bloat the stored row', () => {
		const out = normaliseStatus({ status: 'ERROR', error: 'x'.repeat(5000) });
		expect(out.error!.length).toBe(200);
	});
});

describe('falErrorText', () => {
	it('serialises a structured error rather than printing [object Object]', () => {
		expect(falErrorText({ code: 422, message: 'bad prompt' })).toContain('bad prompt');
	});

	it('falls back to a plain sentence when fal said nothing useful', () => {
		expect(falErrorText(undefined)).toBe('the image model reported an error');
	});
});

/**
 * What actually goes on the wire. The fidelity run found the negative was
 * composed, stored on the prompt row, and then never sent — the body was
 * `{prompt, sync_mode, retention, metadata}` and nothing else.
 *
 * The model has NO `negative_prompt` field (verified against
 * fal.ai/models/fal-ai/nano-banana-2/api, 2026-09-19), so the negative rides
 * inside `prompt` as an `Avoid: ...` clause. These assertions are on the
 * REQUEST BODY, which is the only place that can prove it left the building.
 */
describe('submitZoneImage request body', () => {
	function captureFetch() {
		const calls: { url: string; body: Record<string, unknown> }[] = [];
		const impl = vi.fn(async (url: string | URL, init?: { body?: string }) => {
			calls.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') });
			return new Response(
				JSON.stringify({ request_id: 'req-1', status_url: 's', response_url: 'r' }),
				{ headers: { 'content-type': 'application/json' } }
			);
		});
		return { calls, impl };
	}

	const base = {
		falKey: 'k',
		model: 'fal-ai/nano-banana-2',
		requestKey: '1:library:img-1'
	};

	it('sends the prompt INCLUDING its Avoid clause, plus aspect, resolution and format', async () => {
		const { calls, impl } = captureFetch();
		vi.stubGlobal('fetch', impl);
		try {
			await submitZoneImage({ ...base, prompt: 'a library. Avoid: collage, grid, panels. no text' });
		} finally {
			vi.unstubAllGlobals();
		}
		expect(calls).toHaveLength(1);
		expect(calls[0].body.prompt).toContain('Avoid: collage, grid, panels');
		expect(calls[0].body.aspect_ratio).toBe(DEFAULT_ASPECT_RATIO);
		expect(calls[0].body.resolution).toBe('1K');
		expect(calls[0].body.output_format).toBe('png');
		// No negative_prompt field exists on this model — sending one would be
		// accepted and silently dropped, which is worse than not sending it.
		expect(calls[0].body.negative_prompt).toBeUndefined();
	});

	it('without references it posts to the text-to-image endpoint', async () => {
		const { calls, impl } = captureFetch();
		vi.stubGlobal('fetch', impl);
		try {
			await submitZoneImage({ ...base, prompt: 'a library' });
		} finally {
			vi.unstubAllGlobals();
		}
		expect(calls[0].url).toBe('https://queue.fal.run/fal-ai/nano-banana-2');
		expect(calls[0].body.image_urls).toBeUndefined();
	});

	it('with references it posts to the EDIT endpoint with image_urls', async () => {
		const { calls, impl } = captureFetch();
		vi.stubGlobal('fetch', impl);
		try {
			await submitZoneImage({
				...base,
				prompt: 'a library',
				referenceUrls: ['https://example.test/lens.jpg', 'https://example.test/zone1.png']
			});
		} finally {
			vi.unstubAllGlobals();
		}
		expect(calls[0].url).toBe('https://queue.fal.run/fal-ai/nano-banana-2/edit');
		expect(calls[0].body.image_urls).toEqual([
			'https://example.test/lens.jpg',
			'https://example.test/zone1.png'
		]);
	});

	it('an empty reference list is not a reference — still text-to-image', async () => {
		const { calls, impl } = captureFetch();
		vi.stubGlobal('fetch', impl);
		try {
			await submitZoneImage({ ...base, prompt: 'a library', referenceUrls: [] });
		} finally {
			vi.unstubAllGlobals();
		}
		expect(calls[0].url).toBe('https://queue.fal.run/fal-ai/nano-banana-2');
	});
});

describe('resolutionFrom', () => {
	it('accepts fal\'s own enum and falls back on anything else', () => {
		expect(resolutionFrom('2K')).toBe('2K');
		expect(resolutionFrom('0.5K')).toBe('0.5K');
		for (const bad of [undefined, '', '1080p', 'huge', '2k']) expect(resolutionFrom(bad)).toBe('1K');
	});
});

/**
 * `fal result failed: 422` with no reason is what four of twelve requests
 * left in the error column during the fidelity run. fal puts the reason in
 * the body.
 */
describe('httpFailure', () => {
	it('carries the response body, not just the status code', async () => {
		const res = new Response('{"detail":"prompt rejected"}', { status: 422 });
		await expect(httpFailure('fal result', res)).resolves.toContain('prompt rejected');
	});

	it('caps the captured body', async () => {
		const res = new Response('x'.repeat(5000), { status: 500 });
		await expect(httpFailure('fal result', res)).resolves.toHaveLength('fal result failed: 500 '.length + 300);
	});
});

describe('isRetryableFailure', () => {
	it('retries a provider-side HTTP failure', () => {
		expect(isRetryableFailure('fal result failed: 422 prompt rejected')).toBe(true);
		expect(isRetryableFailure('fal submit failed: 500')).toBe(true);
	});

	it('does not retry something that is not an HTTP failure', () => {
		expect(isRetryableFailure('image url host is not on the allow-list')).toBe(false);
		expect(isRetryableFailure('fal result had no image')).toBe(false);
	});
});

describe('isRetryableFailure — what deserves a second submit', () => {
	it('retries the wobbles: the fidelity run\'s 422, a rate limit, a provider 5xx', () => {
		expect(isRetryableFailure('fal submit failed: 422')).toBe(true);
		expect(isRetryableFailure('fal submit failed: 429 slow down')).toBe(true);
		expect(isRetryableFailure('fal submit failed: 500')).toBe(true);
		expect(isRetryableFailure('fal submit failed: 503')).toBe(true);
	});

	it('does NOT retry an account refusal — a second identical submit cannot fix it', () => {
		// Live: the balance ran out and every submit returned this. Retrying
		// meant each zone discovered it twice while a table watched.
		expect(isRetryableFailure('fal submit failed: 403 User is locked. Please top up your balance.')).toBe(false);
		expect(isRetryableFailure('fal submit failed: 401')).toBe(false);
		expect(isRetryableFailure('fal submit failed: 402 payment required')).toBe(false);
		expect(isRetryableFailure('fal submit failed: 404')).toBe(false);
	});

	it('is false for anything without an HTTP status, so a thrown TypeError is not retried for ever', () => {
		expect(isRetryableFailure('TypeError: fetch failed')).toBe(false);
		expect(isRetryableFailure('')).toBe(false);
	});
});

/**
 * Table 9's plaza row stored `Unexpected status code: 422` and nothing
 * else. That is the whole of what fal's STATUS endpoint returned, so there
 * was no body on that response left uncaptured — the detail lives on the
 * RESULT endpoint for the same request.
 */
describe('pollStatus — turning a status code into a reason', () => {
	/** Answers the status endpoint and the result endpoint differently. */
	function stubFal(statusBody: unknown, resultText: string) {
		const urls: string[] = [];
		vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
			const url = String(input);
			urls.push(url);
			if (url.endsWith('/status')) {
				return new Response(JSON.stringify(statusBody), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				});
			}
			return new Response(resultText, { status: 422 });
		});
		return urls;
	}

	it('adds the result endpoint\'s detail to a thin status error', async () => {
		const urls = stubFal(
			{ status: 'ERROR', detail: 'Unexpected status code: 422' },
			'{"detail":[{"loc":["body","image_urls"],"msg":"url is not reachable"}]}'
		);
		try {
			const out = await pollStatus('k', FAL_MODEL, 'req-1');
			expect(out.status).toBe('ERROR');
			expect(out.error).toContain('Unexpected status code: 422');
			expect(out.error).toContain('url is not reachable');
		} finally {
			vi.unstubAllGlobals();
		}
		expect(urls).toHaveLength(2);
	});

	it('does not print the same line twice when both endpoints say the same thing', async () => {
		stubFal({ status: 'ERROR', detail: 'Unexpected status code: 422' }, 'Unexpected status code: 422');
		try {
			const out = await pollStatus('k', FAL_MODEL, 'req-1');
			expect(out.error).toBe('Unexpected status code: 422');
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('costs nothing on the happy path — no second request unless it failed', async () => {
		const urls = stubFal({ status: 'COMPLETED' }, 'never read');
		try {
			const out = await pollStatus('k', FAL_MODEL, 'req-1');
			expect(out.status).toBe('COMPLETED');
		} finally {
			vi.unstubAllGlobals();
		}
		expect(urls).toHaveLength(1);
	});

	it('still reports the failure if the detail lookup itself throws', async () => {
		// Diagnosis must never be able to fail the thing it is diagnosing.
		vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
			if (String(input).endsWith('/status')) {
				return new Response(JSON.stringify({ status: 'ERROR', detail: 'boom' }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				});
			}
			throw new TypeError('network down');
		});
		try {
			const out = await pollStatus('k', FAL_MODEL, 'req-1');
			expect(out.status).toBe('ERROR');
			expect(out.error).toBe('boom');
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
