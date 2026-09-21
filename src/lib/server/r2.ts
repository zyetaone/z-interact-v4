/**
 * R2 — full-size renders, keyed so an event's whole prefix is one export.
 *
 * Key scheme: `{event}/{table}/{zone}/{imageId}.{ext}`, tile variant
 * `{event}/{table}/{zone}/{imageId}-tile.{ext}`. `imageId` is the `image`
 * row's own id (room.ts) — using the row id rather than a revision counter
 * means a regenerate (a brand new `image` row) can never collide with the
 * attempt it supersedes, with no counter to keep in sync.
 *
 * ponytail: the architecture doc's plan was Cloudflare Image Resizing
 * against the R2 object's public URL for the 0.5K tile, so no resize code
 * runs in the Worker. The team brief overrides that: no Image Resizing,
 * store two objects at generation time instead. A real resize needs either
 * a native binary (sharp — not available in a Workers/Pages runtime) or a
 * wasm decoder (`@jsquash/resize` or similar) — neither is wired here, so
 * `putImage` only ever writes the full object today; `tileBytes` is
 * accepted and stored when the caller already has tile bytes, otherwise
 * omitted. This is also why `generate.ts`'s `stored -> done` transition is
 * unimplemented: `done` is defined as "the tile exists too", and nothing
 * here produces one yet. Upgrade: add `@jsquash/resize` (or the Cloudflare
 * Images binding) in the webhook/tick path and always pass `tileBytes`.
 */

import { sniffImageType } from './fetch-image';

export interface ImageKeyParts {
	event: string;
	table: number;
	zone: string;
	imageId: string;
	ext: string;
}

export function imageKey({ event, table, zone, imageId, ext }: ImageKeyParts): string {
	return `${event}/${table}/${zone}/${imageId}.${ext}`;
}

export function tileKey(parts: ImageKeyParts): string {
	const { event, table, zone, imageId, ext } = parts;
	return `${event}/${table}/${zone}/${imageId}-tile.${ext}`;
}

export interface PutImageInput {
	bucket: R2Bucket;
	key: string;
	bytes: ArrayBuffer | Uint8Array;
	contentType: string;
	/** ponytail: see module note — only written when the caller already has tile bytes. */
	tile?: { key: string; bytes: ArrayBuffer | Uint8Array };
}

export async function putImage({ bucket, key, bytes, contentType, tile }: PutImageInput): Promise<void> {
	await bucket.put(key, bytes, { httpMetadata: { contentType } });
	if (tile) {
		await bucket.put(tile.key, tile.bytes, { httpMetadata: { contentType } });
	}
}

export async function getImage(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
	return bucket.get(key);
}

/* -------------------------------------------------------------------------- */
/* SERVING THE BYTES — one implementation, two routes                         */
/* -------------------------------------------------------------------------- */

/**
 * THE TWO IMAGE ROUTES HAD DIVERGED, and the front page inherited the
 * weaker one (21 Sep route review).
 *
 * `/t/[table]/img/[id]` (the phone) sniffed the type off the bytes and
 * served `immutable` for an hour. `/projector/img/[...key]` (the wall, and
 * now `/` as well) served `object.httpMetadata.contentType` as-is with a
 * 5-minute cache. Every object written before the sniffing fix is still in
 * the bucket labelled `image/webp` whatever it actually is — so a JPEG from
 * before that fix renders on a phone and does not render on the wall, which
 * is the screen the whole room is looking at. CLAUDE.md meanwhile claims
 * objects are "keyed and labelled from sniffed bytes, both written and
 * served"; that was only half true.
 *
 * So both routes call this. It costs a buffered read rather than a streamed
 * one — sniffing means holding the first bytes — which `fetch-image.ts`
 * already caps at 8 MB on the way in.
 *
 * `immutable` is the default and correct for both: every key carries the
 * image row's id (`imageKey`), and a regenerate is a NEW row and therefore
 * a new key. Nothing at one of these URLs ever changes.
 */
export async function imageResponse(object: R2ObjectBody, immutable = true): Promise<Response> {
	const bytes = await object.arrayBuffer();
	return new Response(bytes, {
		headers: {
			// Sniff first, then what the bucket says, then a type a browser
			// will render anyway if we are wrong: a mislabelled JPEG still
			// draws, a mislabelled `webp` does not.
			'content-type': sniffImageType(new Uint8Array(bytes.slice(0, 12))) ?? object.httpMetadata?.contentType ?? 'image/jpeg',
			'cache-control': immutable ? 'public, max-age=3600, immutable' : 'public, max-age=300'
		}
	});
}
