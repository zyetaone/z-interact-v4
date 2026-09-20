/**
 * SPEND LIMITS — the two rules that bound what one table can cost.
 *
 * Both are PURE and live here so `limits.test.ts` drives them without D1,
 * and so the numbers are in one file rather than scattered through the two
 * remote modules that enforce them.
 *
 * Neither limit is held in memory. A Cloudflare isolate is recycled without
 * warning and there are many of them at once, so an in-isolate timer is not
 * a limit at all — a double-tap that lands on two isolates sees two empty
 * timers. Both rules therefore read the `image` table itself: the cooldown
 * is "when was this table's last render row inserted", the cap is "how many
 * render rows does this table have since its last reset". No new column and
 * no new table, which `d1.ts`'s no-migration rule would not have allowed
 * anyway.
 */

/** How long a table waits between one *Draw again* and the next. */
export const REGENERATE_COOLDOWN_MS = 60_000;

/** Renders per table for the whole event, across the first submit and every regenerate. */
export const DEFAULT_MAX_RENDERS_PER_TABLE = 12;

/** Reads `MAX_RENDERS_PER_TABLE` from the environment, falling back to the default on anything unparseable — a typo in a Pages variable must not become "no cap". */
/**
 * A note on what the default now buys: under `ZONE_SET=hero` (the default)
 * a submit queues ONE render, not four, so 12 is about twelve attempts per
 * table rather than three. Generous on purpose — it is a backstop against a
 * loop, not a budget — and the fal dashboard cap is still the only limit
 * that survives a bug in this one (NEW-EVENT.md).
 */
export function maxRendersPerTable(raw: string | undefined): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return DEFAULT_MAX_RENDERS_PER_TABLE;
	return n;
}

export interface RenderBudget {
	/** Render rows this table already has since its last reset. */
	used: number;
	/** `created_at` of the newest render row, or 0 if it has never drawn. */
	lastRenderAt: number;
	/** How many rows one call is about to insert (one per zone). */
	about: number;
	max: number;
	now: number;
}

export type LimitDecision = { ok: true } | { ok: false; reason: string };

/**
 * The cap, worded for a phone screen rather than a log line. Checked for
 * the first submit as well as regenerate — the cap is about total spend per
 * table, and a table that has burned its budget has burned it whichever
 * button spent it.
 */
export function checkRenderCap(b: Pick<RenderBudget, 'used' | 'about' | 'max'>): LimitDecision {
	if (b.used + b.about > b.max) {
		return {
			ok: false,
			reason: `This table has used all ${b.max} of its drawings. The desk can reset the table if you need more.`
		};
	}
	return { ok: true };
}

/** The cooldown, same wording rule. A table that has never drawn is never cooling down. */
export function checkCooldown(
	b: Pick<RenderBudget, 'lastRenderAt' | 'now'>,
	cooldownMs: number = REGENERATE_COOLDOWN_MS
): LimitDecision {
	if (!b.lastRenderAt) return { ok: true };
	const waited = b.now - b.lastRenderAt;
	if (waited >= cooldownMs) return { ok: true };
	const left = Math.max(1, Math.ceil((cooldownMs - waited) / 1000));
	return { ok: false, reason: `Give it ${left} more second${left === 1 ? '' : 's'} before drawing again.` };
}
