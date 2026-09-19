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
