import { query } from '$app/server';
import { requestEnv, eventId } from '$lib/server/env';
import { getRoom } from '$lib/server/room';
import { TABLE_COUNT } from '$lib/game/questions';

/** Full room snapshot for the projector poll (2s, per architecture.md §3). */
export const getRoomSnapshot = query(async () => {
	const env = requestEnv();
	if (!env) return { tables: [] };
	return getRoom(env.DB, eventId(env), TABLE_COUNT);
});

// TODO(content/plumbing): roomImages — per-table, per-zone image metadata
// (key, status, madeAt) — depends on ZONES (zones-video workstream) and the
// images table's read path, neither wired yet. Stub kept as a named export
// so the projector UI content agent has something to import against.
export const roomImages = query(async () => {
	return { images: [] as { table: number; zone: string; status: string; r2Key: string | null }[] };
});
