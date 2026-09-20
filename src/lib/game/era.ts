/**
 * ERA SCALE — the ordered window the era chip sits on (futures.md §5).
 *
 * VERSION 4 of the questions (BRIEF.md, the question owner's 19 Sep 17:58
 * send) drops the era question: "Era (2035/2040) is now a PUSH cue, not a
 * question". The chip on the lens screen keeps the future's default and
 * the one-step nudge; what a nudge changes in the prompt is the year in the
 * cinematic frame (`layers.ts`'s `ERA_YEAR`), nothing more. The stored row
 * keeps its V3 id (`q1`) — an answer id is never renumbered — it is simply
 * no longer a question.
 *
 * "One step earlier or later" is a slice of this array, so every block/allow
 * rule in futures.md §5 falls out of `allowedEras` rather than being
 * enumerated pair by pair. Mirrors the design in the architecture doc's
 * `schema.draft.ts` (`ERA_SCALE`/`eraWindow`), ported here because this repo
 * has no shared schema module yet — content and server stay decoupled.
 */

export const ERA_SCALE = ['retro-1930s', 'same-as-2026', 'recognisably-2035', 'hyperfuturistic-2040'] as const;

export type Era = (typeof ERA_SCALE)[number];

/** The minimal shape `allowedEras`/`nudge` need from a future — avoids importing futures.ts. */
export interface EraBearing {
	eraDefault: Era;
	/** True where any other era contradicts the card's own content — the chip is not nudgeable. */
	eraLocked: boolean;
}

/**
 * Every era a future's chip may land on: the default plus its immediate
 * neighbours on `ERA_SCALE`, or the default alone when locked. This is the
 * greying rule for the era chip on the future card.
 */
export function allowedEras(future: EraBearing): Era[] {
	if (future.eraLocked) return [future.eraDefault];
	const i = ERA_SCALE.indexOf(future.eraDefault);
	return ERA_SCALE.slice(Math.max(0, i - 1), i + 2) as unknown as Era[];
}

/**
 * Move the chip one step toward `dir` on `ERA_SCALE`, clamped at the ends.
 * Callers must still check the result against `allowedEras` before
 * accepting it — this function only walks the raw scale.
 */
export function nudge(era: Era, dir: 'earlier' | 'later'): Era {
	const i = ERA_SCALE.indexOf(era);
	const next = dir === 'earlier' ? i - 1 : i + 1;
	return ERA_SCALE[Math.max(0, Math.min(ERA_SCALE.length - 1, next))];
}

/** Whether `era` is reachable at all, and whether it's allowed-but-dull. */
export function eraVerdict(
	future: EraBearing & { eraWarn?: readonly Era[] },
	era: Era
): 'ok' | 'warn' | 'blocked' {
	if (!allowedEras(future).includes(era)) return 'blocked';
	return future.eraWarn?.includes(era) ? 'warn' : 'ok';
}
