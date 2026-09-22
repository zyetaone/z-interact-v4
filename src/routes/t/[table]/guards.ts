/**
 * THE GUARDS the phone's every call runs through, and the small pure reads
 * its commands share.
 *
 * Split out of `answers.remote.ts` 22 Sep. What lives here changes when a
 * RULE changes — the table-number range, the free-text ceiling, who may
 * still save, what a tick needs to know. What stays in the `.remote.ts`
 * file changes when a SCREEN changes. Those are different clocks and they
 * were in one 1,091-line file.
 *
 * `throttle` is here rather than in either caller for a reason: it is one
 * per ISOLATE, and two modules each calling `createThrottle()` would be two
 * locks where the code reads as one. It is still an optimisation and not a
 * guard — see `throttle.ts`'s own note; the real guards are D1's
 * `INSERT ... WHERE NOT EXISTS` and the state machine's compare-and-swap.
 */
import * as v from 'valibot';
import { TABLE_COUNT } from '$lib/game/questions';
import { ERA_SCALE } from '$lib/game/era';
import { FUTURES } from '$lib/game/futures';
import { FAL_MODEL } from '$lib/server/fal';
import { requestEnv, requestOrigin } from '$lib/server/env';
import { decideSubmit, lockedAt, mayReopen } from '$lib/server/gate';
import { getTableState, getCurrentAnswers } from '$lib/server/room';
import { createThrottle } from '$lib/server/throttle';
import type { TickContext } from '$lib/server/ticker';
import type { AnswerLike } from './layers';

export const tableNo = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(TABLE_COUNT),
);
/**
 * The ceiling on every free-text field a phone can send.
 *
 * The wildcard already had 140 and the screen-15 rewrite has 1200. These
 * two did not have one at all: `pushReply` on saveEra/saveAnswer, and the
 * `text` map behind an open option. Both reach the image prompt verbatim
 * through `layers.ts`, so an unbounded string was an unbounded prompt on a
 * wall in front of the room. 140 matches the wildcard, which is the same
 * kind of field and the length a table actually types.
 */
export const FREE_TEXT_MAX = 140;

export const eraSchema = v.picklist(ERA_SCALE);

/** The pseudo-question id the future pick is stored under. `q1` stores the era. */
export const FUTURE_ID = "future";

/**
 * What a skipped future card stores (game-flow.md §1, screen 3's failure
 * state: "stored as `skipped`"). It has to be a real key rather than an
 * empty array, or the answer reads as unanswered for ever: the review
 * button stays on "still missing 1 answer" and resume sends the table
 * back to the future screen on every reload. `futureOf` returns null for
 * it, so the mood layer still falls back to the house register.
 */
export const SKIPPED = "skipped";

/** fal model id — TODO(content): set once the model is chosen (also stubbed in ticker.ts). */
export const MODEL = FAL_MODEL;

// One per isolate — best-effort, see throttle.ts's module note.
const throttle = createThrottle();

export type Fail = { ok: false; reason: string };

/**
 * `refresh()` pushes a fresh snapshot to the CLIENT that made the call. It
 * is a courtesy — the 2 s poll would pick the change up anyway — and it has
 * no meaning when the caller is not a browser (the simulator route drives
 * these same commands server-side). A failure there must never fail the
 * save that already landed.
 */
export function refreshQuietly(status: { refresh(): Promise<unknown> }): void {
  try {
    void Promise.resolve(status.refresh()).catch(() => {});
  } catch {
    /* not a client call — nothing to refresh */
  }
}

export type Env = NonNullable<ReturnType<typeof requestEnv>>;

/** Every command runs inside this: one in-flight write per table, always released. */
export async function withTableLock<T>(
  table: number,
  fn: () => Promise<T | Fail>,
): Promise<T | Fail> {
  if (!throttle.acquire(table)) {
    return {
      ok: false,
      reason: "This table is already sending something — hang tight.",
    };
  }
  try {
    return await fn();
  } finally {
    throttle.release(table);
  }
}

/**
 * Everything `tickImageRow` needs that is the same for every row of one
 * table: the bindings, the origin (references must be absolute — fal
 * fetches them), the chosen future's lens picture, and the reset watermark
 * so a pre-reset render is never used as a style anchor.
 */
export function tickContext(
  env: Env,
  event: string,
  futureKey: string | null,
  since: number,
): TickContext {
  return { db: env.DB, env, event, origin: requestOrigin(), futureKey, since };
}

/**
 * The lock check every per-answer save now runs. Only `finishTable` used to
 * check anything, so a table could keep editing its answers after it had
 * submitted, and after the desk had closed the room — and those edits feed
 * `resolveZone` on the next poll or regenerate, silently changing what gets
 * sent to fal.
 *
 * Deliberately NOT `assertCanSubmit`: that function CONSUMES a one-shot
 * reopen grant on success, so calling it from a per-tap save would burn the
 * desk's grant on the first question the table answered. This reads the
 * same state without consuming anything and applies the same pure rule —
 * the pattern `tableStatus`'s own gate read already uses.
 */
export async function assertCanSave(
  env: Env,
  event: string,
  table: number,
): Promise<{ ok: true } | Fail> {
  const state = await getTableState(env.DB, event, table);
  const alreadyAnswered = !!state.submittedAt;
  const [locked, granted] = await Promise.all([
    lockedAt(env.DB, event),
    alreadyAnswered
      ? mayReopen(env.DB, event, table)
      : Promise.resolve(false),
  ]);
  const decision = decideSubmit({
    reachable: true,
    locked: !!locked,
    alreadyAnswered,
    granted,
  });
  return decision.ok
    ? { ok: true as const }
    : { ok: false as const, reason: decision.reason };
}

export function answersOf(
  rows: Awaited<ReturnType<typeof getCurrentAnswers>>,
): AnswerLike[] {
  return rows.map((r) => ({
    questionId: r.questionId,
    keys: r.keys,
    text: r.text,
    pushReply: r.pushReply,
  }));
}

export function futureOf(answers: readonly AnswerLike[]): string | null {
  const key = answers.find((a) => a.questionId === FUTURE_ID)?.keys[0] ?? null;
  return key && FUTURES.some((f) => f.key === key) ? key : null;
}



/* -------------------------------------------------------------------------- */
