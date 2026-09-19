/**
 * R2 — full-size renders, keyed so an event's whole prefix is one export.
 *
 * Key scheme: `{event}/{table}/{zone}/{rev}.{ext}`, tile variant
 * `{event}/{table}/{zone}/{rev}-tile.{ext}`.
 *
 * ponytail: the architecture doc's plan was Cloudflare Image Resizing
 * against the R2 object's public URL for the 0.5K tile, so no resize code
 * runs in the Worker. The team brief overrides that: no Image Resizing,
 * store two objects at generation time instead. A real resize needs either
 * a native binary (sharp — not available in a Workers/Pages runtime) or a
 * wasm decoder (`@jsquash/resize` or similar) — neither is wired here, so
 * `putImage` only ever writes the full object today; `tileBytes` is
 * accepted and stored when the caller already has tile bytes (e.g. produced
 * by fal itself, if a future model returns multiple sizes), otherwise
 * omitted. Upgrade: add `@jsquash/resize` (or the Cloudflare Images
 * binding) in the webhook handler and always pass `tileBytes`.
 */
export interface ImageKeyParts {
	event: string;
	table: number;
	zone: string;
	rev: number;
	ext: string;
}

export function imageKey({ event, table, zone, rev, ext }: ImageKeyParts): string {
	return `${event}/${table}/${zone}/${rev}.${ext}`;
}

export function tileKey(parts: ImageKeyParts): string {
	const { event, table, zone, rev, ext } = parts;
	return `${event}/${table}/${zone}/${rev}-tile.${ext}`;
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
