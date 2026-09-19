/**
 * Event title for the Lobby beat. `$env/dynamic/public` is a SvelteKit
 * built-in, not part of this app's own `Env` type in `server/env.ts` — read
 * this way so the title is configurable without touching that file (which
 * this workstream doesn't own). Defaults to "Twenty Tables" per the brief.
 */
import { env } from '$env/dynamic/public';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	return { eventTitle: env.PUBLIC_EVENT_TITLE?.trim() || 'Twenty Tables' };
};
