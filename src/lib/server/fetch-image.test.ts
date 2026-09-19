/**
 * The three guards on the one place this app pulls bytes off the internet.
 * The webhook's image URL arrives from outside, so each of these was a real
 * hole: any host, any size, any content.
 */
import { describe, expect, it, vi } from 'vitest';
import {
	MAX_IMAGE_BYTES,
	extForContentType,
	fetchImageBytes,
	isAllowedImageHost,
	sniffImageType
} from './fetch-image';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function imageResponse(bytes: Uint8Array, contentType = 'image/png', headers: Record<string, string> = {}) {
	return new Response(bytes as unknown as BodyInit, { headers: { 'content-type': contentType, ...headers } });
}

describe('isAllowedImageHost', () => {
	it("accepts fal's image CDN, which is a DIFFERENT domain from its API", () => {
		expect(isAllowedImageHost('https://v3.fal.media/files/a.webp')).toBe(true);
		expect(isAllowedImageHost('https://v3b.fal.media/files/a.webp')).toBe(true);
		expect(isAllowedImageHost('https://fal.media/a.webp')).toBe(true);
		expect(isAllowedImageHost('https://queue.fal.run/x')).toBe(true);
	});

	it('rejects a host that merely ENDS with an allowed string', () => {
		// The suffix-match trap: `evil-fal.media` is not a fal subdomain.
		expect(isAllowedImageHost('https://evil-fal.media/a.png')).toBe(false);
		expect(isAllowedImageHost('https://falmedia.example/a.png')).toBe(false);
	});

	it('rejects everything else, and anything not https', () => {
		expect(isAllowedImageHost('https://attacker.example/a.png')).toBe(false);
		expect(isAllowedImageHost('http://v3.fal.media/a.png')).toBe(false);
		expect(isAllowedImageHost('file:///etc/passwd')).toBe(false);
		expect(isAllowedImageHost('not a url')).toBe(false);
	});
});

describe('sniffImageType', () => {
	it('recognises the formats this app serves', () => {
		expect(sniffImageType(PNG)).toBe('image/png');
		expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg');
		expect(
			sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))
		).toBe('image/webp');
	});

	it('returns null for bytes that are not an image', () => {
		expect(sniffImageType(new TextEncoder().encode('<html>hello</html>'))).toBeNull();
	});
});

describe('fetchImageBytes', () => {
	it('fetches an allow-listed image and reports its SNIFFED type', async () => {
		const fetchImpl = vi.fn(async () => imageResponse(PNG));
		const out = await fetchImageBytes('https://v3.fal.media/a.png', { fetchImpl: fetchImpl as never });
		expect(out.contentType).toBe('image/png');
		expect(out.bytes.byteLength).toBe(PNG.byteLength);
	});

	it('refuses a host off the allow-list WITHOUT making the request', async () => {
		const fetchImpl = vi.fn(async () => imageResponse(PNG));
		await expect(
			fetchImageBytes('https://attacker.example/a.png', { fetchImpl: fetchImpl as never })
		).rejects.toThrow(/allow-list/);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('refuses a declared content-type that is not an image', async () => {
		const fetchImpl = vi.fn(async () => imageResponse(PNG, 'text/html'));
		await expect(
			fetchImageBytes('https://v3.fal.media/a.png', { fetchImpl: fetchImpl as never })
		).rejects.toThrow(/text\/html/);
	});

	it('refuses bytes that are not an image even when the type header says they are', async () => {
		const fetchImpl = vi.fn(async () => imageResponse(new TextEncoder().encode('not an image at all'), 'image/png'));
		await expect(
			fetchImageBytes('https://v3.fal.media/a.png', { fetchImpl: fetchImpl as never })
		).rejects.toThrow(/not a supported image/);
	});

	it('refuses an oversized body on content-length alone, before reading it', async () => {
		const fetchImpl = vi.fn(async () =>
			imageResponse(PNG, 'image/png', { 'content-length': String(MAX_IMAGE_BYTES + 1) })
		);
		await expect(
			fetchImageBytes('https://v3.fal.media/a.png', { fetchImpl: fetchImpl as never })
		).rejects.toThrow(/cap/);
	});

	it('refuses an oversized body that DECLARED no length — the loop is the real limit', async () => {
		const big = new Uint8Array(64);
		big.set(PNG);
		const fetchImpl = vi.fn(async () => imageResponse(big, 'image/png'));
		await expect(
			fetchImageBytes('https://v3.fal.media/a.png', { maxBytes: 16, fetchImpl: fetchImpl as never })
		).rejects.toThrow(/cap/);
	});

	it('decodes the FAL_FAKE data url inline, so the fake path still works', async () => {
		const b64 = btoa(String.fromCharCode(...PNG));
		const out = await fetchImageBytes(`data:image/png;base64,${b64}`);
		expect(out.contentType).toBe('image/png');
		expect(out.bytes.byteLength).toBe(PNG.byteLength);
	});
});

describe('extForContentType', () => {
	it('matches the extension to the bytes actually stored', () => {
		expect(extForContentType('image/png')).toBe('png');
		expect(extForContentType('image/jpeg')).toBe('jpg');
		expect(extForContentType('image/webp')).toBe('webp');
	});
});
