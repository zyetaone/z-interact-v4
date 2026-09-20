/**
 * Serves one stored render to the table's own phone.
 *
 * Table-scoped on purpose: the id in the path is a `generations` row's id
 * (that is what `answers.remote.ts`'s `tableStatus` builds the URL from —
 * `generations` already carries `r2_key` once `stored`, so there's no need
 * to also look up the separate append-only `images` "current" pointer just
 * to serve bytes). The row's `table_no` must match the `[table]` segment,
 * so a guessed id from another table 404s rather than leaking that table's
 * picture before the projector shows it. The URL is still the only
 * credential (ADR-036 §3) — this is a scoping check, not authentication.
 */
import { error } from '@sveltejs/kit';
import { envOf, eventId } from '$lib/server/env';
import { getImageById } from '$lib/server/room';
import { getImage } from '$lib/server/r2';
import { sniffImageType } from '$lib/server/fetch-image';
import type { RequestHandler } from './$types';

/**
 * WHAT THE BYTES ARE, NOT WHAT SOMETHING ONCE ASSUMED THEY WERE.
 *
 * Every object used to be written under a hardcoded `image/webp`, so this
 * route carried a PNG-only sniffer and an `image/webp` fallback to undo
 * that at read time. The write path now stores the sniffed type and keys
 * the object by the matching extension, so the stored metadata is right —
 * but objects written before that fix are still in the bucket wearing the
 * old label, and the fallback would go on mislabelling anything that is
 * not a PNG.
 *
 * So: sniff first, using the same signature table the write path uses
 * rather than a second private copy of it; fall back to the stored
 * metadata; and only then to a type. `image/jpeg` rather than
 * `image/webp` as the last resort, because a browser handed the wrong
 * label for a JPEG still renders it and a wrong `webp` label does not.
 */
function contentTypeFor(bytes: ArrayBuffer, stored: string | undefined): string {
	return sniffImageType(new Uint8Array(bytes.slice(0, 12))) ?? stored ?? 'image/jpeg';
}

export const GET: RequestHandler = async ({ params, platform }) => {
	const env = envOf(platform);
	if (!env) error(503, 'no environment');

	const row = await getImageById(env.DB, params.id);
	if (!row || row.table !== Number(params.table) || row.eventId !== eventId(env)) error(404, 'no such image');
	if (!row.r2Key) error(404, 'not stored yet');

	const object = await getImage(env.IMAGES, row.r2Key);
	if (!object) error(404, 'not in the bucket');

	const bytes = await object.arrayBuffer();
	return new Response(bytes, {
		headers: {
			'content-type': contentTypeFor(bytes, object.httpMetadata?.contentType),
			// Immutable: a regenerate is a new row and therefore a new URL.
			'cache-control': 'public, max-age=3600, immutable'
		}
	});
};
