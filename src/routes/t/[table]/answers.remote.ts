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
 * `promptId`) rather than a placeholder. That is what makes a phone that
 * died mid-generation, or a webhook that never arrives, recover for free.
 *
 * Three rules this file holds to:
 *
 *  - **One prompt row PER ZONE**, four per submit. `generate.ts`'s
 *    `tick()` submits `prompt.composed` verbatim for the row its
 *    `promptId` names, so `composed` has to BE the exact per-zone string
 *    (NO_TEXT guards + base + that zone's resolved suffix + NO_TEXT). All
 *    four rows carry the same layer columns, which is how the table-level
 *    BASE text — the thing screen 15's textarea edits — is recovered after
 *    submit: `composeBase` over those columns. When the table edits the
 *    prompt, the edited base is stored in `mood` with the other three
 *    layers blank and `edited_by_table = 1`, so the same recovery returns
 *    the edit unchanged.
 *  - **The poll never calls `assertCanSubmit`** — that function CONSUMES a
 *    one-shot reopen grant on success, so polling it every two seconds
 *    would burn the desk's grant before the table pressed anything. The
 *    poll reads `lockedAt` + `mayReopen` and applies the pure
 *    `decideSubmit` instead.
 *  - **Every command is throttled by table number**, never by client IP
 *    (one venue router is one IP).
 */
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
  finishTable as finishTableRow,
  insertPrompt,
  getCurrentImage,
} from "$lib/server/room";
import {
  insertGeneration,
  getLatestGeneration,
  tick,
  tickTable,
  type GenerationRow,
} from "$lib/server/generate";
import { createThrottle } from "$lib/server/throttle";
import { realFalClient, buildWebhookUrl } from "$lib/server/ticker";
import { getLatestPrompt } from "./prompt-store";
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
export const FUTURE_ID = "future";

/** fal model id — TODO(content): set once the model is chosen (also stubbed in ticker.ts). */
const MODEL = "TODO(content): fal model id";

// One per isolate — best-effort, see throttle.ts's module note.
const throttle = createThrottle();

type Fail = { ok: false; reason: string };

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

/**
 * The per-row fal client every ticker in this file uses. `tickTable` asks
 * for one per row so the webhook URL can name that row's own id — that is
 * the whole reason `falFor` is a function and not a value.
 */
function falForRow(env: NonNullable<ReturnType<typeof requestEnv>>) {
  const origin = requestOrigin();
  return (row: GenerationRow) =>
    realFalClient(
      env,
      MODEL,
      buildWebhookUrl(origin, env.FAL_WEBHOOK_SECRET, row.id),
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
    const answers = answersOf(await getCurrentAnswers(env.DB, event, table));

    // TICKER: advance every in-flight generation for this table by one
    // step, through the same `tickTable` the admin poll and the webhook
    // route use. Nothing bespoke lives here (game-flow.md §6/§8).
    await tickTable(env.DB, env.IMAGES, falForRow(env), event, table);

    const images = [];
    for (const zone of ZONES) {
      const [current, generation] = await Promise.all([
        getCurrentImage(env.DB, event, table, zone.key),
        getLatestGeneration(env.DB, event, table, zone.key),
      ]);
      images.push({
        zoneKey: zone.key,
        state: generation?.state ?? "none",
        url: current ? `/t/${table}/img/${current.generationId}` : null,
        error: generation?.error ?? null,
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
    const storedBase = stored
      ? composeBase({
          mood: stored.mood,
          materialsAndLight: stored.material,
          programme: stored.programme,
          feel: stored.feel,
          wildcard: stored.wildcard ?? undefined,
        })
      : null;

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
      prompt: storedBase ?? preview,
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
        keys: future ? [future.key] : [],
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
      return { ok: true as const, era: future?.eraDefault ?? null };
    }),
);

/**
 * Screen 3b/3c. `pushReply` is Q1's "what are you protecting" field, which
 * the flow only shows when the era lands on 2026 — it is appended to the
 * mood layer verbatim.
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
      await saveAnswerRow(env.DB, {
        eventId: eventId(env),
        table,
        questionId: WILDCARD.id,
        keys: text.trim() ? [WILDCARD.options[0].key] : [],
        text: text.trim()
          ? { [WILDCARD.options[0].key]: text.trim() }
          : undefined,
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

interface QueueResult {
  composed: string;
  queued: number;
}

/**
 * Inserts one prompt row per zone (append-only, actor 'table'), then one
 * `generations` row per zone in `ZONES`, then kicks the first tick for each
 * through `waitUntil`.
 *
 * `supersedes` is set on a regenerate so the previous attempt stays in the
 * table rather than being overwritten — an image row appended later by
 * `tick()` is what moves "current" (`room.ts`'s `getCurrentImage`).
 */
async function queueGeneration(
  env: NonNullable<ReturnType<typeof requestEnv>>,
  event: string,
  table: number,
  opts: { composedOverride?: string; regenerate: boolean },
): Promise<QueueResult> {
  const answers = answersOf(await getCurrentAnswers(env.DB, event, table));
  const layers = buildLayerInputs({
    futureKey: futureOf(answers),
    era: eraOf(answers),
    answers,
  });
  const edited = !!opts.composedOverride?.trim();
  const base = edited ? opts.composedOverride!.trim() : composeBase(layers);

  // An edit cannot be decomposed back into four layers, so it rides in
  // `mood` alone and the other three go blank — `composeBase` over the
  // stored columns then returns the edit unchanged. See the module note.
  const stored = edited
    ? {
        mood: base,
        material: "",
        programme: "",
        feel: "",
        wildcard: undefined as string | undefined,
      }
    : {
        mood: layers.mood,
        material: layers.materialsAndLight,
        programme: layers.programme,
        feel: layers.feel,
        wildcard: layers.wildcard,
      };

  const fal = falForRow(env);
  const fresh: GenerationRow[] = [];

  for (const zone of ZONES) {
    const existing = await getLatestGeneration(env.DB, event, table, zone.key);
    // "A generation already in flight is returned, not duplicated"
    // (game-flow §8) — but a regenerate deliberately supersedes it.
    if (!opts.regenerate && existing && existing.state !== "failed") continue;

    // `composed` IS what tick() submits, so the zone suffix and the
    // NO_TEXT guards have to be baked in here, not applied later.
    const promptId = await insertPrompt(env.DB, {
      eventId: event,
      table,
      mood: stored.mood,
      material: stored.material,
      programme: stored.programme,
      feel: stored.feel,
      wildcard: stored.wildcard,
      composed: composeZonePrompt(base, resolveZone(zone, answers)),
      negative: layers.negative,
      editedByTable: edited,
      actor: "table",
    });

    fresh.push(
      await insertGeneration(env.DB, {
        eventId: event,
        table,
        zone: zone.key,
        promptId,
      }),
    );
  }

  // waitUntil kicks the first tick; the phone/admin polls and the webhook
  // are the safety net if it is cut short (game-flow §6).
  for (const row of fresh) {
    void requestWaitUntil(tick(env.DB, env.IMAGES, fal(row), row));
  }
  return { composed: base, queued: fresh.length };
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
 * puts it (on the images screen, after submit). Room lock and the per-table
 * throttle are the two limits that do apply.
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
      const result = await queueGeneration(env, event, table, {
        composedOverride: composed,
        regenerate: true,
      });
      void tableStatus({ table }).refresh();
      return { ok: true as const, queued: result.queued };
    }),
);
