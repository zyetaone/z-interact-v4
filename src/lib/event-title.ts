/**
 * THE TITLES, IN ONE PLACE, because they were in two and one of them got
 * fixed on 22 Sep while the other kept saying "Twenty Tables".
 *
 * `/` and `/projector` each have their own `+page.server.ts`, and each
 * carried its own `env.PUBLIC_EVENT_TITLE?.trim() || 'Twenty Tables'`. The
 * projector's fallback was changed and the front page's was not, so the wall
 * said one thing and the browser tab said another — the same string, twice,
 * which is two strings.
 *
 * They are deliberately DIFFERENT strings, not one shared one: the wall
 * asks the room a question it is about to answer, and the front page is the
 * grid of twenty tiles somebody is standing in front of. One override
 * (`PUBLIC_EVENT_TITLE`) still replaces both, because a real event's own
 * name belongs on both and belongs nowhere in this repo.
 */

/** The wall's Lobby headline — the question the room is being asked. */
export const PROJECTOR_TITLE = 'The Cognitive City Vision';

/**
 * The front page and the browser tab — the room, addressed to the people in
 * it. The year is deliberately IN the headline: the questions ask what a
 * workplace is like once the present has moved on, and a date says that
 * faster than a sentence can. It is a fallback like every string here, so a
 * differently-dated event replaces it with `PUBLIC_EVENT_TITLE` rather than
 * editing source.
 */
export const SITE_TITLE = 'Your cognitive city 2040';

/** `PUBLIC_EVENT_TITLE` wins on both surfaces when it is set. */
export function titleFrom(override: string | undefined, fallback: string): string {
	return override?.trim() || fallback;
}
