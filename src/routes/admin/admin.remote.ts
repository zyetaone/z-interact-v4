/**
 * Admin mission control. ponytail: no auth yet — anyone who knows the path
 * can lock the room / seed / delete a table. Acceptable for a scaffold
 * behind a venue network, not for production; upgrade path is a shared
 * admin token checked in a `+layout.server.ts` for this route, same shape
 * as any other command-gate in this app.
 */
import * as v from 'valibot';
import { command, query } from '$app/server';
import { requestEnv, eventId } from '$lib/server/env';
import { lockedAt, setLocked, grantReopen } from '$lib/server/gate';
import { TABLE_COUNT } from '$lib/game/questions';

const tableNo = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(TABLE_COUNT));

export const roomLock = query(async () => {
	const env = requestEnv();
	if (!env) return { closed: false };
	return { closed: !!(await lockedAt(env.DB, eventId(env))) };
});

export const setRoomLock = command(v.object({ locked: v.boolean() }), async ({ locked }) => {
	const env = requestEnv();
	if (!env) return { ok: false as const };
	await setLocked(env.DB, eventId(env), locked);
	return { ok: true as const };
});

export const reopenTable = command(v.object({ table: tableNo }), async ({ table }) => {
	const env = requestEnv();
	if (!env) return { ok: false as const };
	await grantReopen(env.DB, eventId(env), table);
	return { ok: true as const };
});

// TODO(plumbing): seedRoom, deleteTable, resetRoom, exportRoom — ported
// behaviour from z-presence's room.remote.ts, not code. Stubbed so the
// admin UI content agent has stable names to import; each currently
// no-ops with `{ ok: false, reason: 'not implemented' }`.
export const seedRoom = command(v.object({ count: v.optional(v.number()) }), async () => {
	return { ok: false as const, reason: 'not implemented' };
});

export const deleteTable = command(v.object({ table: tableNo }), async () => {
	return { ok: false as const, reason: 'not implemented' };
});

export const resetRoom = command(v.object({}), async () => {
	return { ok: false as const, reason: 'not implemented' };
});

export const exportRoom = query(async () => {
	return { ok: false as const, reason: 'not implemented' };
});
