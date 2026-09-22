/**
 * THE ARCHIVE READ — every picture the event produced, with a link that
 * downloads it.
 *
 * Its own file, and its own route, for the reason `/admin/analytics` is
 * separate from `/admin`: this page must never tick and must never spend.
 * The desk's poll advances pending rows in `waitUntil`; a page whose job is
 * "save what already happened" has no business submitting anything to fal
 * because somebody left it open on a laptop after the event.
 *
 * One query, no commands.
 */
import * as v from 'valibot';
import { query } from '$app/server';
import { requestEnv, eventId } from '$lib/server/env';
import { adminTokenOk } from '$lib/server/admin-gate';
import { listStoredImages } from '$lib/server/archive';

export type Photo = { id: string; table: number; zoneKey: string; url: string; filename: string; createdAt: number };

export const roomPhotos = query(v.object({ token: v.string() }), async ({ token }) => {
	const env = requestEnv();
	if (!env) return { ok: false as const, reason: 'no environment' };
	// `devOpen: true` matches the desk and the readout: an unset token is
	// open in dev only, and production is unaffected because `dev` is false
	// there. This page reads; it does not spend.
	if (!adminTokenOk(env.ADMIN_TOKEN, token, { devOpen: true })) return { ok: false as const, reason: 'bad token' };

	const event = eventId(env);
	const rows = await listStoredImages(env.DB, event);

	// The extension comes off the stored key, which r2.ts writes from SNIFFED
	// bytes — not from an assumption that everything is a .webp, which is the
	// bug both serve routes had until 21 Sep. A file saved with the wrong
	// extension opens in nothing.
	const photos: Photo[] = rows.map((r, i) => {
		const ext = r.r2Key.includes('.') ? r.r2Key.slice(r.r2Key.lastIndexOf('.') + 1) : 'jpg';
		// Ordinal per table, so four redraws of table 7 save as -1, -2, -3, -4
		// rather than overwriting each other in the download folder.
		const nth = rows.filter((o) => o.table === r.table).indexOf(r) + 1;
		return {
			id: r.id,
			table: r.table,
			zoneKey: r.zoneKey,
			url: `/projector/img/${r.r2Key}`,
			filename: `${event}-table-${String(r.table).padStart(2, '0')}-${nth}.${ext}`,
			createdAt: r.createdAt
		};
	});

	return { ok: true as const, event, photos, tables: new Set(photos.map((p) => p.table)).size };
});
