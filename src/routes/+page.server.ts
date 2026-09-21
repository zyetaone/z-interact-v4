/**
 * Same pattern as the projector's: `$env/dynamic/public`, so the title is
 * configurable without touching `server/env.ts`, and the same default.
 */
import { env } from '$env/dynamic/public';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	return { eventTitle: env.PUBLIC_EVENT_TITLE?.trim() || 'Twenty Tables' };
};
