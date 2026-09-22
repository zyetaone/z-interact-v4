/**
 * The front page's title. The fallback lives in `$lib/event-title` with the
 * projector's, because these two files each used to carry their own copy of
 * the same literal and only one of them got updated.
 */
import { env } from '$env/dynamic/public';
import { SITE_TITLE, titleFrom } from '$lib/event-title';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	return { eventTitle: titleFrom(env.PUBLIC_EVENT_TITLE, SITE_TITLE) };
};
