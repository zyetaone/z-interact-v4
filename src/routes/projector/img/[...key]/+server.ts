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
import { envOf, eventId } from '$lib/server/env';
import { getImage } from '$lib/server/r2';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform }) => {
	const env = envOf(platform);
	if (!env) error(503, 'image storage unavailable');

	const key = params.key;
	if (!key) error(400, 'missing key');

	// SCOPED TO THIS EVENT. The key used to be passed straight to `bucket.get`
	// with no ownership check. R2 has no `..` traversal, so this was never
	// classic path traversal — but the bucket is one bucket across events
	// while D1 is one database PER event, so the moment a second event reused
	// it, anyone holding one event's image key could read another's through
	// this public route. `r2.ts`'s key scheme starts every object with the
	// event id, so the prefix check is the ownership check.
	const prefix = `${eventId(env)}/`;
	if (!key.startsWith(prefix)) error(404, 'not found');

	const object = await getImage(env.IMAGES, key);
	if (!object) error(404, 'not found');

	return new Response(object.body, {
		headers: {
			'content-type': object.httpMetadata?.contentType ?? 'image/jpeg',
			'cache-control': 'public, max-age=300'
		}
	});
};
