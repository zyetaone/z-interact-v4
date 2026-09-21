/**
 * THE ONLY FILE IN `server/` THAT IMPORTS `$app/server`.
 *
 * Every other server module takes its D1/R2 handles as plain arguments, so
 * it can be unit-tested with in-memory fakes and no SvelteKit request
 * context (`getRequestEvent()` throws outside a request — under vitest, in
 * `/simulate`, and in any module loaded at build time). This file is the
 * one seam that bridges "plain function" to "Cloudflare binding", and it
 * fails soft (returns undefined) rather than throwing, so a caller can
 * `if (!env) return` instead of wrapping every call in try/catch.
 *
 * Ported pattern from z-presence's env.ts, generalized to the typed `Env`
 * shape this app's bindings need (D1 + R2 + fal secrets).
 */
import { getRequestEvent } from '$app/server';

export interface Env {
	DB: D1Database;
	IMAGES: R2Bucket;
	/**
	 * Workers AI, for the done screen's table narrative only (`routes/t/[table]/narrative.ts`).
	 * Structural rather than the `Ai` type, so nothing new is installed for one call.
	 * Absent (an older deploy, a missing binding) means the phone shows no paragraph.
	 */
	AI?: { run(model: string, input: unknown): Promise<unknown> };
	/** `1` writes a deterministic narrative and never touches the `AI` binding — the `FAL_FAKE` of this feature. */
	AI_FAKE?: string;
	FAL_KEY?: string;
	FAL_WEBHOOK_SECRET?: string;
	SIMULATE_ENABLED?: string;
	/** `<app>-<YYYY-MM>` per NEW-EVENT.md. No event name is hardcoded in source — this is how every row gets its `event_id`. */
	EVENT_ID?: string;
	/** Shared-secret query token gating the hidden `/admin` URL (admin.remote.ts's `checkToken`). Unset in `dev` opens the gate; unset in production fails closed. */
	ADMIN_TOKEN?: string;
	/**
	 * How much the chosen lens picture decides the render: `none` (default,
	 * text-to-image everywhere), `lens` (first zone only), `chain` (every
	 * zone). See `server/reference.ts` for what each one looked like on a
	 * real table. Unrecognised falls back to `none`.
	 */
	REFERENCE_MODE?: string;
	/**
	 * Which zones render: `hero` (default) one main workspace image per
	 * table, `four` the four functional zones, `all` five. Unset or
	 * unrecognised means `hero` — a typo must not quintuple what a room
	 * spends. See `game/zones.ts`'s `activeZones`.
	 */
	ZONE_SET?: string;
	/**
	 * How many pending rows one admin poll advances, oldest first. Unset or
	 * unparseable means 8. The tick runs after the response either way, so
	 * this trades how much of the room the desk carries, not how fast the
	 * desk answers.
	 */
	ADMIN_TICK_BUDGET?: string;
	/** fal render resolution (`0.5K`/`1K`/`2K`/`4K`). Unset or unrecognised falls back to `1K`, fal's own default. The single biggest cost lever in the app — see NEW-EVENT.md. */
	FAL_RESOLUTION?: string;
	/**
	 * `off` sends fal no `system_prompt` at all and the app renders exactly
	 * as it did before the house rules moved into that field. Anything else
	 * (including unset) sends `prompt.ts`'s `HOUSE_SYSTEM`. The one knob to
	 * reach for on the night if the renders come back worse rather than
	 * better — the composed prompt still carries every house rule itself,
	 * so turning this off loses nothing.
	 */
	SYSTEM_PROMPT?: string;
	/** Total renders one table may spend across the whole event — first submit plus every regenerate. Parsed by `limits.ts`'s `maxRendersPerTable`, which falls back to 12 rather than to "no cap". */
	MAX_RENDERS_PER_TABLE?: string;
}

/** Falls back to a dev-only placeholder so local `npm run dev` works before NEW-EVENT.md's checklist sets a real one. */
export function eventId(env: Env | undefined): string {
	return env?.EVENT_ID ?? 'dev-event';
}

/** The current request's platform env, or undefined outside a request. */
export function requestEnv(): Env | undefined {
	try {
		return getRequestEvent().platform?.env as Env | undefined;
	} catch {
		return undefined;
	}
}

/**
 * Same as `requestEnv()` but for callers that already hold `platform`
 * directly (route handlers like `+server.ts`, which receive it as an
 * argument rather than pulling it from request-local storage).
 */
export function envOf(platform: App.Platform | undefined): Env | undefined {
	return platform?.env;
}

/**
 * `platform.context.waitUntil` from inside a `query`/`command` remote
 * function — those don't receive `platform` as an argument the way
 * `+server.ts` does, so this is the seam. `waitUntil` KICKS the first
 * generation tick; it is an optimisation, not the mechanism (game-flow.md
 * §6) — every ticker (phone poll, admin poll, webhook) can resume the same
 * row, so a missing/failed `waitUntil` only costs latency, never correctness.
 */
export function requestWaitUntil(promise: Promise<unknown>): void {
	try {
		const ctx = getRequestEvent().platform?.context;
		if (ctx) ctx.waitUntil(promise);
		else promise.catch(() => {});
	} catch {
		promise.catch(() => {});
	}
}

/** The current request's origin (`https://host`), or undefined outside a request — used to build the fal webhook URL at submit time. */
export function requestOrigin(): string | undefined {
	try {
		return getRequestEvent().url.origin;
	} catch {
		return undefined;
	}
}

/** Client IP — read-only diagnostic. Never used as a throttle/rate-limit key (ADR-036: one venue router is one IP). */
export function clientIp(): string {
	try {
		return getRequestEvent().request.headers.get('CF-Connecting-IP')?.trim() || 'unknown';
	} catch {
		return 'unknown';
	}
}
