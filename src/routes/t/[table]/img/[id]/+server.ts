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
import type { RequestHandler } from './$types';

/** R2 objects are written with `image/webp` metadata; the FAL_FAKE dev branch stores a PNG. Sniff rather than trust. */
function sniff(bytes: ArrayBuffer, fallback: string): string {
	const head = new Uint8Array(bytes.slice(0, 4));
	if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'image/png';
	return fallback;
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
			'content-type': sniff(bytes, object.httpMetadata?.contentType ?? 'image/webp'),
			// Immutable: a regenerate is a new row and therefore a new URL.
			'cache-control': 'public, max-age=3600, immutable'
		}
	});
};
