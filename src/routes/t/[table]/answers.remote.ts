/**
 * Remote functions for `/t/[table]` — the table phone's whole server API.
 *
 * `error()`/`redirect()` work inside `query` but NOT inside `command`
 * (ADR-036 §3) — every command here returns a typed `{ ok: false, reason }`
 * instead of throwing.
 *
 * `tableStatus` is BOTH the screens' one read and a TICKER (game-flow.md
 * §6/§8): every poll walks this table's non-terminal `image` rows and
 * advances each one exactly one `generate.ts` step via the shared
 * `ticker.ts`, now submitting the row's REAL composed prompt (read by
 * `promptId`) rather than the placeholder string that stood in for it.
 * That is what makes a phone that died mid-generation, or a webhook that
 * never arrives, recover for free the next time anything polls.
 *
 * Three rules this file holds to:
 *
 *  - **One prompt row per table**, not per zone — `schema.draft.ts`'s
 *    `PromptRow` has no zone column. `prompt.composed` is the table-level
 *    text screen 15's textarea edits; the zone's own suffix and the
 *    NO_TEXT guards are applied at submit time by `layers.ts`'s
 *    `composeZonePrompt`, so an edited prompt and an unedited one go
 *    through exactly one composer.
 *  - **The poll never calls `assertCanSubmit`** — that function CONSUMES a
 *    one-shot reopen grant on success, so polling it every two seconds
 *    would burn the desk's grant before the table pressed anything. The
 *    poll reads `lockedAt` + `mayReopen` and applies the pure
 *    `decideSubmit` instead.
 *  - **Every command is throttled by table number**, never by client IP
 *    (one venue router is one IP).
 */
import { FAL_MODEL } from '$lib/server/fal';
import * as v from "valibot";
import { command, query } from "$app/server";
import {
  requestEnv,
  eventId,
  requestWaitUntil,
  requestOrigin,
} from "$lib/server/env";
import { TABLE_COUNT, WILDCARD } from "$lib/game/questions";
import { ZONES } from "$lib/game/zones";
import { ERA_SCALE, eraVerdict, type Era } from "$lib/game/era";
import { FUTURES } from "$lib/game/futures";
import {
  decideSubmit,
  lockedAt,
  mayReopen,
  assertCanSubmit,
} from "$lib/server/gate";
import {
  saveAnswer as saveAnswerRow,
  getTableState,
  getCurrentAnswers,
  getCurrentAnswersSince,
  getCurrentImageSince,
  getResetAt,
  finishTable as finishTableRow,
  insertPrompt,
  insertQueuedImage,
  getCurrentImage,
  getPendingImagesForTable,
} from "$lib/server/room";
import { createThrottle } from "$lib/server/throttle";
import {
  tickAndPersist,
  realGenerateDeps,
  buildWebhookUrl,
} from "$lib/server/ticker";
import { getLatestPrompt, getPromptById } from "./prompt-store";
import {
  buildLayerInputs,
  composeBase,
  composeZonePrompt,
  resolveZone,
  type AnswerLike,
} from "./layers";

const tableNo = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(TABLE_COUNT),
);
const eraSchema = v.picklist(ERA_SCALE);

/** The pseudo-question id the future pick is stored under. `q1` stores the era. */
const FUTURE_ID = "future";

/**
 * What a skipped future card stores (game-flow.md §1, screen 3's failure
 * state: "stored as `skipped`"). It has to be a real key rather than an
 * empty array, or the answer reads as unanswered for ever: the review
 * button stays on "still missing 1 answer" and resume sends the table
 * back to the future screen on every reload. `futureOf` returns null for
 * it, so the mood layer still falls back to the house register.
 */
const SKIPPED = "skipped";

/** fal model id — TODO(content): set once the model is chosen (also stubbed in ticker.ts). */
const MODEL = FAL_MODEL;

// One per isolate — best-effort, see throttle.ts's module note.
const throttle = createThrottle();

type Fail = { ok: false; reason: string };
type Env = NonNullable<ReturnType<typeof requestEnv>>;

/** Every command runs inside this: one in-flight write per table, always released. */
async function withTableLock<T>(
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

/** One row's real fal + R2 deps, with this app's webhook URL naming that row. */
function depsFor(
  env: Env,
  event: string,
  table: number,
  zoneKey: string,
  imageId: string,
) {
  return realGenerateDeps(
    env,
    event,
    table,
    zoneKey,
    imageId,
    buildWebhookUrl(requestOrigin(), env.FAL_WEBHOOK_SECRET, imageId),
  );
}

function answersOf(
  rows: Awaited<ReturnType<typeof getCurrentAnswers>>,
): AnswerLike[] {
  return rows.map((r) => ({
    questionId: r.questionId,
    keys: r.keys,
    text: r.text,
    pushReply: r.pushReply,
  }));
}

function futureOf(answers: readonly AnswerLike[]): string | null {
  const key = answers.find((a) => a.questionId === FUTURE_ID)?.keys[0] ?? null;
  return key && FUTURES.some((f) => f.key === key) ? key : null;
}

function eraOf(answers: readonly AnswerLike[]): Era | null {
  const key = answers.find((a) => a.questionId === "q1")?.keys[0];
  return key && (ERA_SCALE as readonly string[]).includes(key)
    ? (key as Era)
    : null;
}

/* -------------------------------------------------------------------------- */
/* Read — one call per poll, everything a screen needs                        */
/* -------------------------------------------------------------------------- */

export const tableStatus = query(
  v.object({ table: tableNo }),
  async ({ table }) => {
    const env = requestEnv();
    if (!env) {
      return {
        table,
        future: null as string | null,
        era: null as Era | null,
        answers: [] as AnswerLike[],
        prompt: "",
        promptEdited: false,
        images: [] as {
          zoneKey: string;
          state: string;
          url: string | null;
          error: string | null;
        }[],
        submittedAt: null as number | null,
        closed: false,
        granted: false,
        canSubmit: false,
        gateReason:
          "We could not reach the room, so nothing was sent — your answer is still on this phone. Try again.",
      };
    }
    const event = eventId(env);
    const state = await getTableState(env.DB, event, table);
    // An admin reset (room.ts's `table_reset` watermark) must be visible
    // here: `getCurrentAnswers`/`getCurrentImage` alone would still surface
    // pre-reset rows as "current" (they're append-only, never deleted), so
    // this phone read is filtered to what's current SINCE the table's most
    // recent reset — same rule admin's own reads already apply.
    const since = await getResetAt(env.DB, event, table);
    const answers = answersOf(
      await getCurrentAnswersSince(env.DB, event, table, since),
    );

    // TICKER: advance every in-flight generation for this table by one
    // step, each submitting its OWN row's composed prompt.
    for (const row of await getPendingImagesForTable(env.DB, event, table)) {
      if (row.createdAt <= since) continue; // pre-reset attempt — not resumed
      const zone = ZONES.find((z) => z.key === row.zoneKey);
      const stored = await getPromptById(env.DB, row.promptId);
      if (!zone || !stored) continue;
      await tickAndPersist(
        env.DB,
        {
          id: row.id,
          state: row.state,
          falRequestId: row.falRequestId,
          createdAt: row.createdAt,
          table,
          zoneKey: row.zoneKey,
        },
        composeZonePrompt(stored.composed, resolveZone(zone, answers)),
        depsFor(env, event, table, row.zoneKey, row.id),
      );
    }

    const images = [];
    for (const zone of ZONES) {
      const row = await getCurrentImageSince(env.DB, event, table, zone.key, since);
      const arrived = row?.state === "stored" || row?.state === "done";
      images.push({
        zoneKey: zone.key,
        state: row?.state ?? "none",
        url: arrived && row ? `/t/${table}/img/${row.id}` : null,
        error: row?.error ?? null,
      });
    }

    // The prompt the review screen shows: the stored row once one exists,
    // otherwise a live preview composed from whatever is answered so far.
    const stored = await getLatestPrompt(env.DB, event, table);
    const preview = composeBase(
      buildLayerInputs({
        futureKey: futureOf(answers),
        era: eraOf(answers),
        answers,
      }),
    );

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

    return {
      table,
      future: futureOf(answers),
      era: eraOf(answers),
      answers,
      prompt: stored?.composed ?? preview,
      promptEdited: stored?.editedByTable ?? false,
      images,
      submittedAt: state.submittedAt,
      closed: !!locked,
      granted,
      canSubmit: decision.ok,
      gateReason: decision.ok ? "" : decision.reason,
    };
  },
);

/* -------------------------------------------------------------------------- */
/* Writes — every one append-only, every one throttled by table               */
/* -------------------------------------------------------------------------- */

/**
 * Screen 3. Also writes the future's own default era as the `q1` answer, so
 * the chip is never empty on a resume and a table that never touches the
 * chip still has a stored Q1.
 */
export const saveFuture = command(
  v.object({ table: tableNo, futureKey: v.nullable(v.string()) }),
  async ({ table, futureKey }) =>
    withTableLock(table, async () => {
      const env = requestEnv();
      if (!env) return { ok: false as const, reason: "no environment" };
      const future = futureKey
        ? FUTURES.find((f) => f.key === futureKey)
        : undefined;
      if (futureKey && !future)
        return { ok: false as const, reason: "unknown future" };
      const event = eventId(env);
      await saveAnswerRow(env.DB, {
        eventId: event,
        table,
        questionId: FUTURE_ID,
        keys: [future ? future.key : SKIPPED],
        actor: "table",
        source: "tap",
      });
      if (future) {
        await saveAnswerRow(env.DB, {
          eventId: event,
          table,
          questionId: "q1",
          keys: [future.eraDefault],
          actor: "table",
          source: "tap",
        });
      }
      void tableStatus({ table }).refresh();
      return { ok: true as const };
    }),
);

/**
 * Screen 3b/3c. `pushReply` is Q1's "what are you protecting" field, which
 * the flow only shows when the era lands on 2026 — appended to the mood
 * layer verbatim.
 */
export const saveEra = command(
  v.object({
    table: tableNo,
    era: eraSchema,
    pushReply: v.optional(v.string()),
  }),
  async ({ table, era, pushReply }) =>
    withTableLock(table, async () => {
      const env = requestEnv();
      if (!env) return { ok: false as const, reason: "no environment" };
      const event = eventId(env);
      const answers = answersOf(await getCurrentAnswers(env.DB, event, table));
      const future = FUTURES.find((f) => f.key === futureOf(answers));
      // The greying rule is data (era.ts), so it is enforced here too —
      // a greyed chip on the phone is a hint, not a boundary.
      if (future && eraVerdict(future, era) === "blocked") {
        return {
          ok: false as const,
          reason: `${future.name} cannot be set in that era.`,
        };
      }
      await saveAnswerRow(env.DB, {
        eventId: event,
        table,
        questionId: "q1",
        keys: [era],
        pushReply: pushReply?.trim() || undefined,
        actor: "table",
        source: "tap",
      });
      void tableStatus({ table }).refresh();
      return { ok: true as const };
    }),
);

const SaveAnswerInput = v.object({
  table: tableNo,
  questionId: v.string(),
  keys: v.array(v.string()),
  text: v.optional(v.record(v.string(), v.string())),
  /** The ◆ questions' Push line doubles as a typed capture field (Q2, Q5, Q9). */
  pushReply: v.optional(v.string()),
});

export const saveAnswer = command(SaveAnswerInput, async (input) =>
  withTableLock(input.table, async () => {
    const env = requestEnv();
    if (!env) return { ok: false as const, reason: "no environment" };
    await saveAnswerRow(env.DB, {
      eventId: eventId(env),
      table: input.table,
      questionId: input.questionId,
      keys: input.keys,
      text: input.text,
      pushReply: input.pushReply?.trim() || undefined,
      actor: "table",
      source: "tap",
    });
    void tableStatus({ table: input.table }).refresh();
    return { ok: true as const };
  }),
);

/** Screen 14 — stored as an ordinary answer row under the wildcard's own id. */
export const saveWildcard = command(
  v.object({ table: tableNo, text: v.pipe(v.string(), v.maxLength(140)) }),
  async ({ table, text }) =>
    withTableLock(table, async () => {
      const env = requestEnv();
      if (!env) return { ok: false as const, reason: "no environment" };
      const trimmed = text.trim();
      await saveAnswerRow(env.DB, {
        eventId: eventId(env),
        table,
        questionId: WILDCARD.id,
        keys: trimmed ? [WILDCARD.options[0].key] : [],
        text: trimmed ? { [WILDCARD.options[0].key]: trimmed } : undefined,
        actor: "table",
        source: "tap",
      });
      void tableStatus({ table }).refresh();
      return { ok: true as const };
    }),
);

/* -------------------------------------------------------------------------- */
/* Generation — one prompt row, one image row per zone, then the first tick   */
/* -------------------------------------------------------------------------- */

/**
 * Inserts ONE prompt row for the table (append-only, actor 'table'), then
 * one `image` row per zone in `ZONES`, then kicks the first tick for each
 * through `waitUntil`.
 *
 * `supersedesId` is set on a regenerate so the previous attempt stays in
 * the table rather than being overwritten — `getCurrentImage` reads the
 * newest row, so the new attempt becomes current the moment it is inserted.
 */
async function queueGeneration(
  env: Env,
  event: string,
  table: number,
  opts: { composedOverride?: string; regenerate: boolean },
): Promise<{ promptId: string; composed: string; queued: number }> {
  const answers = answersOf(await getCurrentAnswers(env.DB, event, table));
  const layers = buildLayerInputs({
    futureKey: futureOf(answers),
    era: eraOf(answers),
    answers,
  });
  const edited = !!opts.composedOverride?.trim();
  const composed = edited ? opts.composedOverride!.trim() : composeBase(layers);
  const previous = await getLatestPrompt(env.DB, event, table);

  const promptId = await insertPrompt(env.DB, {
    eventId: event,
    table,
    mood: layers.mood,
    material: layers.materialsAndLight,
    programme: layers.programme,
    feel: layers.feel,
    wildcard: layers.wildcard,
    composed,
    negative: layers.negative,
    editedByTable: edited,
    actor: "table",
    supersedesId: previous?.id ?? null,
  });

  let queued = 0;
  for (const zone of ZONES) {
    const existing = await getCurrentImage(env.DB, event, table, zone.key);
    // "A generation already in flight is returned, not duplicated"
    // (game-flow §8) — but a regenerate deliberately supersedes it.
    if (!opts.regenerate && existing && existing.state !== "failed") continue;

    const zonePrompt = composeZonePrompt(composed, resolveZone(zone, answers));
    const image = await insertQueuedImage(env.DB, {
      eventId: event,
      table,
      zoneKey: zone.key,
      promptId,
      prompt: zonePrompt,
      model: MODEL,
      actor: "table",
      supersedesId: existing?.id ?? null,
    });
    queued += 1;

    // waitUntil kicks the first tick; the phone/admin polls and the
    // webhook are the safety net if it is cut short (game-flow §6).
    requestWaitUntil(
      tickAndPersist(
        env.DB,
        {
          id: image.id,
          state: image.state,
          falRequestId: image.falRequestId,
          createdAt: image.createdAt,
          table,
          zoneKey: zone.key,
        },
        zonePrompt,
        depsFor(env, event, table, zone.key, image.id),
      ),
    );
  }
  return { promptId, composed, queued };
}

/** Screen 15's *Draw our workspace*. `composed` is the edited textarea, when the table changed it. */
export const finishTable = command(
  v.object({ table: tableNo, composed: v.optional(v.string()) }),
  async ({ table, composed }) =>
    withTableLock(table, async () => {
      const env = requestEnv();
      if (!env) return { ok: false as const, reason: "no environment" };
      const event = eventId(env);

      const state = await getTableState(env.DB, event, table);
      const decision = await assertCanSubmit(
        env.DB,
        event,
        table,
        !!state.submittedAt,
      );
      if (!decision.ok) return { ok: false as const, reason: decision.reason };

      await finishTableRow(env.DB, event, table);
      const result = await queueGeneration(env, event, table, {
        composedOverride: composed,
        regenerate: false,
      });
      void tableStatus({ table }).refresh();
      return { ok: true as const, queued: result.queued };
    }),
);

/**
 * Screen 17's *draw again*. Deliberately NOT behind `assertCanSubmit`: that
 * gate blocks a table that has already submitted unless the desk granted a
 * reopen, which would make regenerate unusable exactly where game-flow §1
 * puts it — on the images screen, after submit. The room lock and the
 * per-table throttle are the two limits that do apply.
 */
export const regenerate = command(
  v.object({ table: tableNo, composed: v.optional(v.string()) }),
  async ({ table, composed }) =>
    withTableLock(table, async () => {
      const env = requestEnv();
      if (!env) return { ok: false as const, reason: "no environment" };
      const event = eventId(env);
      if (await lockedAt(env.DB, event)) {
        return {
          ok: false as const,
          reason: "The room is closed — the screen has moved on.",
        };
      }
      // "Regenerate (throttled, per table)" (game-flow §1, screen 17).
      // `withTableLock` only covers concurrent CALLS, which release in
      // milliseconds; this covers a generation still in flight, so a
      // double-tap cannot queue eight rows.
      if ((await getPendingImagesForTable(env.DB, event, table)).length > 0) {
        return {
          ok: false as const,
          reason: "Still drawing — wait for this one before asking for another.",
        };
      }
      const result = await queueGeneration(env, event, table, {
        composedOverride: composed,
        regenerate: true,
      });
      void tableStatus({ table }).refresh();
      return { ok: true as const, queued: result.queued };
    }),
);
