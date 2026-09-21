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
import { getImage, imageResponse } from '$lib/server/r2';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform }) => {
	const env = envOf(platform);
	if (!env) error(503, 'no environment');

	const row = await getImageById(env.DB, params.id);
	if (!row || row.table !== Number(params.table) || row.eventId !== eventId(env)) error(404, 'no such image');
	if (!row.r2Key) error(404, 'not stored yet');

	const object = await getImage(env.IMAGES, row.r2Key);
	if (!object) error(404, 'not in the bucket');

	// Sniffing, the type fallbacks and the immutable cache all live in
	// `r2.ts`'s `imageResponse` now — the projector's route serves the same
	// bytes and had drifted to a weaker rule. See that function's note.
	return imageResponse(object);
};
