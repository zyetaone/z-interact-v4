/**
 * READ-ONLY R2 PROXY — the projector has no other way to put a stored zone
 * image on screen; nothing in this repo served R2 bytes over HTTP before
 * this route. Scoped under `projector/` (this workstream's own tree) and
 * built only from functions `server/r2.ts`/`server/env.ts` already export
 * (`getImage`, `envOf`) — no server file was edited to add this.
 *
 * `[...key]` (a rest param) so the R2 key's own `/`-separated segments
 * (`{event}/{table}/{zone}/{imageId}.{ext}`, r2.ts's `imageKey`) pass
 * through untouched instead of needing escaping.
 */
import { error } from '@sveltejs/kit';
import { envOf } from '$lib/server/env';
import { getImage } from '$lib/server/r2';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform }) => {
	const env = envOf(platform);
	if (!env) error(503, 'image storage unavailable');

	const key = params.key;
	if (!key) error(400, 'missing key');

	const object = await getImage(env.IMAGES, key);
	if (!object) error(404, 'not found');

	return new Response(object.body, {
		headers: {
			'content-type': object.httpMetadata?.contentType ?? 'image/jpeg',
			'cache-control': 'public, max-age=300'
		}
	});
};
