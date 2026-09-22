/**
 * Event title for the Lobby beat — the one line the room reads on the wall
 * before anything has been drawn.
 *
 * `$env/dynamic/public` is a SvelteKit built-in, not part of this app's own
 * `Env` type in `server/env.ts`, so the title is configurable without
 * touching that file.
 *
 * The default was "Twenty Tables", which is what the brief called the
 * exercise while it was being built. On the wall it names the FURNITURE:
 * the room is told how many tables are in it by a screen it is looking at
 * to find out what it is being asked. The default now says the subject —
 * the same words the phone's first question uses ("How do you imagine your
 * future cognitive city?"), so the wall and the phone ask one question
 * rather than two.
 *
 * Still a default, not a hard-coding: `PUBLIC_EVENT_TITLE` overrides it per
 * event, which is where a real event's own name belongs (it never belongs
 * in this repo — see CLAUDE.md).
 */
import { env } from '$env/dynamic/public';
import type { PageServerLoad } from './$types';

export const EVENT_TITLE_FALLBACK = 'The Cognitive City Vision';

export const load: PageServerLoad = () => {
	return { eventTitle: env.PUBLIC_EVENT_TITLE?.trim() || EVENT_TITLE_FALLBACK };
};
