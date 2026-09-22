/**
 * `/health?token=<ADMIN_TOKEN>` — the one-glance answer to "is the room
 * moving?", for the desk machine or a phone on venue wifi, without opening
 * the admin screen and without printing a secret.
 *
 * JSON only, no page. It answers from D1 and ticks nothing: unlike the
 * admin poll this is a read a human refreshes by hand, and a probe that
 * spends fal money is a probe nobody runs twice.
 *
 * FAILS CLOSED, always — `adminTokenOk` with no `devOpen` refuses a missing expected value,
 * so an unset `ADMIN_TOKEN` rejects every request rather than opening the
 * route. That is `/simulate`'s rule, not `/admin`'s dev-open one: `/admin`
 * is behind a hidden URL a human types, this is a URL that would otherwise
 * be guessable on a real domain.
 */
import { json } from '@sveltejs/kit';
import { envOf, eventId } from '$lib/server/env';
import { adminDenial } from '$lib/server/admin-gate';
import { getBeat, getHealthCounts } from '$lib/server/room';
import { TABLE_COUNT } from '$lib/game/questions';
import type { RequestHandler } from './$types';

/** How recent a failure has to be to count as "the room is failing now" rather than "the room had a bad row earlier". */
const FAILED_WINDOW_MS = 10 * 60 * 1000;

export const GET: RequestHandler = async ({ url, platform }) => {
	const env = envOf(platform);
	// No `devOpen`: an ops endpoint with an unset token stays shut on a
	// laptop too. Same rule as `/simulate`, now said in one file.
	if (!env || adminDenial(env.ADMIN_TOKEN, url.searchParams.get('token'))) {
		return json({ ok: false, reason: 'unauthorized' }, { status: 401 });
	}

	const event = eventId(env);
	const [beat, counts] = await Promise.all([getBeat(env.DB, event), getHealthCounts(env.DB, event, Date.now() - FAILED_WINDOW_MS)]);

	return json({
		ok: true,
		eventId: event,
		beat: beat.beat,
		focusTable: beat.focusTable,
		pending: counts.pending,
		failedRecent: counts.failedRecent,
		failedWindowMinutes: FAILED_WINDOW_MS / 60000,
		submitted: counts.submitted,
		tables: TABLE_COUNT
	});
};
