/**
 * THE ONE PLACE THIS APP PULLS IMAGE BYTES OFF THE INTERNET.
 *
 * Both the ticker's poll path and the fal webhook used to do a bare
 * `fetch(url)` on a URL that arrives from outside, then `arrayBuffer()` it
 * unbounded and write it to R2 under a hardcoded `image/webp`. On the
 * webhook that URL is attacker-suppliable: a forged callback could point
 * this app at any host, pull any number of bytes through it, and put the
 * result on the public projector.
 *
 * Three guards, applied to both callers through this single function:
 *
 *  1. **Host allow-list.** fal's API host and its image CDN are different
 *     domains — the API is `fal.run`/`fal.ai`, the images come back from
 *     `v3.fal.media`/`v3b.fal.media`. Allow-listing only `*.fal.ai` blocks
 *     every real image while looking correct, which is the trap
 *     `z-common-ground`'s CSP note already records; this list is taken from
 *     what the sibling apps accept, not from memory.
 *  2. **A byte cap.** `arrayBuffer()` has no ceiling below the isolate's
 *     own memory. `content-length` is checked first when the server sends
 *     one, and the read loop aborts past the cap regardless — a server can
 *     lie about, or omit, its length.
 *  3. **It has to be an image.** The declared content-type must be
 *     `image/*` AND the leading bytes must match a format this app serves.
 *     The real type is returned, so R2 stores what actually arrived instead
 *     of every object claiming to be webp.
 */

/** 8 MB. A 1-2K render lands far under this; anything above it is not a render. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Hosts fal serves results from. Exact host or a subdomain of one of these
 * — never a suffix match on a bare string, which `evil-fal.media` would pass.
 */
export const ALLOWED_IMAGE_HOSTS = ['fal.media', 'fal.ai', 'fal.run', 'r2.dev'] as const;

export function isAllowedImageHost(raw: string): boolean {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return false;
	}
	if (url.protocol !== 'https:') return false;
	const host = url.hostname.toLowerCase();
	return ALLOWED_IMAGE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Leading-byte signatures for the formats this app is willing to store and serve. */
export function sniffImageType(bytes: Uint8Array): string | null {
	const b = bytes;
	if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
	if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
	if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
	if (
		b.length >= 12 &&
		b[0] === 0x52 &&
		b[1] === 0x49 &&
		b[2] === 0x46 &&
		b[3] === 0x46 &&
		b[8] === 0x57 &&
		b[9] === 0x45 &&
		b[10] === 0x42 &&
		b[11] === 0x50
	)
		return 'image/webp';
	return null;
}

/** The file extension R2 stores an object under, so a served object's URL matches its bytes. */
export function extForContentType(contentType: string): string {
	switch (contentType) {
		case 'image/png':
			return 'png';
		case 'image/jpeg':
			return 'jpg';
		case 'image/gif':
			return 'gif';
		default:
			return 'webp';
	}
}

export interface FetchedImage {
	bytes: ArrayBuffer;
	/** The SNIFFED type, not the declared one — what R2 should actually store. */
	contentType: string;
}

/**
 * `FAL_FAKE=1` hands back a `data:` URL (see `fal.ts`'s fake), which has no
 * host to allow-list and no network fetch to bound. Decoded inline, before
 * the host check, so the fake path still exercises the same sniff and cap.
 */
function decodeDataUrl(url: string): FetchedImage | null {
	const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);
	if (!m) return null;
	const [, declared, isBase64, payload] = m;
	const raw = isBase64 ? atob(payload) : decodeURIComponent(payload);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	const sniffed = sniffImageType(bytes);
	if (!sniffed || !declared.startsWith('image/')) return null;
	return { bytes: bytes.buffer as ArrayBuffer, contentType: sniffed };
}

export async function fetchImageBytes(
	url: string,
	{ maxBytes = MAX_IMAGE_BYTES, fetchImpl = fetch }: { maxBytes?: number; fetchImpl?: typeof fetch } = {}
): Promise<FetchedImage> {
	if (url.startsWith('data:')) {
		const decoded = decodeDataUrl(url);
		if (!decoded) throw new Error('image data url was not a supported image');
		return decoded;
	}
	if (!isAllowedImageHost(url)) {
		throw new Error('image url host is not on the allow-list');
	}

	const res = await fetchImpl(url);
	if (!res.ok) throw new Error(`fetch image failed: ${res.status}`);

	const declared = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
	if (!declared.startsWith('image/')) throw new Error(`image url served ${declared || 'no content-type'}`);

	const declaredLength = Number(res.headers.get('content-length'));
	if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
		throw new Error(`image is ${declaredLength} bytes, over the ${maxBytes} cap`);
	}

	const bytes = await readCapped(res, maxBytes);
	const sniffed = sniffImageType(bytes);
	if (!sniffed) throw new Error('image bytes are not a supported image format');
	return { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, contentType: sniffed };
}

/** Reads the body, aborting past the cap. A server may omit or lie about `content-length`, so the loop is the real limit. */
async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
	const reader = res.body?.getReader();
	if (!reader) {
		const buf = new Uint8Array(await res.arrayBuffer());
		if (buf.byteLength > maxBytes) throw new Error(`image exceeded the ${maxBytes} byte cap`);
		return buf;
	}
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel().catch(() => {});
			throw new Error(`image exceeded the ${maxBytes} byte cap`);
		}
		chunks.push(value);
	}
	const out = new Uint8Array(total);
	let at = 0;
	for (const c of chunks) {
		out.set(c, at);
		at += c.byteLength;
	}
	return out;
}
