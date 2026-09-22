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
import { TABLE_COUNT, WILDCARD, STEER } from "$lib/game/questions";
import { activeZones, zoneByKey } from "$lib/game/zones";
import { ERA_SCALE, eraVerdict, type Era } from "$lib/game/era";
import { ALL_FUTURES, FUTURES } from "$lib/game/futures";
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
  insertQueuedImageIfIdle,
  getRenderBudget,
  getImageDetail,
  getTableFutures,
} from "$lib/server/room";
import { findRestorable, restoreImages } from "$lib/server/archive";
import {
  checkCooldown,
  checkRenderCap,
  maxRendersPerTable,
} from "$lib/server/limits";
import { tickImageRow, tickRowSafely, type TickContext } from "$lib/server/ticker";
import { getLatestPrompt, getPromptById } from "./prompt-store";
import { composePromptFor } from "./hero";
import { ensureNarrative, getNarrative } from "./narrative";
import { sanitizeComposed } from "$lib/server/prompt";
import {
  FREE_TEXT_MAX,
  FUTURE_ID,
  MODEL,
  SKIPPED,
  answersOf,
  assertCanSave,
  eraSchema,
  futureOf,
  refreshQuietly,
  tableNo,
  tickContext,
  withTableLock,
  type Env,
  type Fail,
} from "./guards";
import { queueGeneration } from "./queue";
import {
  buildLayerInputs,
  composeBase,
  composeZonePrompt,
  resolveZone,
  type AnswerLike,
  eraOf,
} from "./layers";

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
        promptEditable: false,
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
        narrative: null as string | null,
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
      // EVERY set, not the active one: a row queued under a different
      // ZONE_SET still has to be carried to `stored`.
      const zone = zoneByKey(row.zoneKey);
      const stored = await getPromptById(env.DB, row.promptId);
      if (!zone || !stored) continue;
      // Safely: a throw here used to reject the whole poll, so the phone
      // kept showing its last snapshot ("being drawn") with no error.
      await tickRowSafely(
        tickContext(env, event, futureOf(answers), since),
        {
          id: row.id,
          state: row.state,
          falRequestId: row.falRequestId,
          createdAt: row.createdAt,
          table,
          zoneKey: row.zoneKey,
        },
        composePromptFor(zone, {
          composed: stored.composed,
          negative: stored.negative,
          answers,
          futureKey: futureOf(answers),
          era: eraOf(answers),
          table,
        }),
      );
    }

    // A table that has submitted SINCE its last reset should have a row for
    // every zone. If one is missing, nothing is coming for it: reporting
    // `none` made the phone render it as "still drawing" for ever, which is
    // the one thing a table cannot act on. It reads as failed instead, with
    // a reason, which is also what makes the per-zone retry reachable.
    const submittedSinceReset = !!state.submittedAt && state.submittedAt > since;
    const images = [];
    for (const zone of activeZones(env.ZONE_SET)) {
      const row = await getCurrentImageSince(env.DB, event, table, zone.key, since);
      const arrived = row?.state === "stored" || row?.state === "done";
      const missing = !row && submittedSinceReset;
      images.push({
        zoneKey: zone.key,
        state: missing ? "failed" : (row?.state ?? "none"),
        url: arrived && row ? `/t/${table}/img/${row.id}` : null,
        error: missing
          ? "this one was never sent — try it again"
          : (row?.error ?? null),
      });
    }

    // "What we asked for" HAS TO BE WHAT WE ASKED FOR.
    //
    // This used to be `composeBase(...)`, the shared base clause, which is
    // not what any renderer receives. Under the hero default the difference
    // was the whole prompt: the panel showed a comma-separated list of
    // fragments beginning "A film still, a 2035 workplace", while the image
    // was drawn from "Design a workplace that is relevant in 2035 for a team
    // that chose..." in full sentences. So the one screen that explains the
    // system to a table described a system that does not exist, and it is
    // the artifact the question owner asked for when she asked what goes in
    // and what comes out.
    //
    // It now runs the same chooser every submit path runs. When the room
    // renders one image per table there is exactly one prompt and the panel
    // shows it verbatim. Under a multi-zone set the zones differ only by
    // their own suffix, so the shared base is still the honest summary and
    // the panel falls back to it rather than picking one zone to speak for
    // the other three.
    // SINCE THE WATERMARK, like every other read on this poll. Without it a
    // reset table showed the PREVIOUS run's prompt in its review panel, and
    // carried that run's `editedByTable` flag with it.
    const stored = await getLatestPrompt(env.DB, event, table, since);
    const layers = buildLayerInputs({
      futureKey: futureOf(answers),
      era: eraOf(answers),
      answers,
      table,
    });
    const base = composeBase(layers);
    const shown = activeZones(env.ZONE_SET);
    const preview =
      shown.length === 1
        ? composePromptFor(shown[0], {
            composed: stored?.composed ?? base,
            negative: stored?.negative ?? "",
            answers,
            futureKey: futureOf(answers),
            era: eraOf(answers),
            table,
          })
        : base;

    // THE DONE SCREEN'S PARAGRAPH. Read only — a poll never waits on a
    // model, the same rule that took the admin read off the fal path. If
    // `finishTable`'s own `waitUntil` never landed (dead phone, recycled
    // isolate) the kick below writes one for the next poll to find.
    const narrative = submittedSinceReset
      ? await getNarrative(env.DB, event, table, since)
      : null;
    if (submittedSinceReset && !narrative) {
      requestWaitUntil(ensureNarrative(env, event, table, answers, since));
    }

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

    // At least one picture is on screen. Nothing earlier can exist otherwise.
    const hasArrived = images.some((i) => i.url);

    return {
      table,
      future: futureOf(answers),
      era: eraOf(answers),
      answers,
      // `preview` already folds in the stored row under a single-zone room
      // (it composes FROM `stored.composed`), so it wins there. With several
      // zones the stored base is the thing to show.
      prompt: shown.length === 1 ? preview : (stored?.composed ?? preview),
      promptEdited: stored?.editedByTable ?? false,
      // WHETHER EDITING IT WOULD DO ANYTHING. Under `ZONE_SET=hero` — the
      // default — `composePromptFor` answers a hero zone with
      // `composeHeroPrompt(answers)` and never reads the edited string, so
      // screen 15 was offering a ten-row textarea whose contents were
      // stored, exported, shown back, and then thrown away at render time.
      // The screen asks for this rather than inferring it from the image
      // count, because "one zone" and "the edit is ignored" are two facts
      // that happen to coincide today and need not tomorrow.
      // `prompt-edit.test.ts` pins the behaviour either way.
      promptEditable: activeZones(env.ZONE_SET).length > 1,
      images,
      // WHETHER THERE IS ANYTHING TO GO BACK TO. Computed here rather than
      // inferred on the phone from "have I redrawn?", because a table that
      // redrew and then undid has redrawn twice and has nothing further
      // back that is not already on screen.
      //
      // GUARDED, because this poll runs every two seconds on twenty phones.
      // A table that has not submitted has no image rows at all, and one
      // whose picture has not arrived has nothing earlier than it — asking
      // D1 once per zone to be told so is a query per zone per table per two
      // seconds, bought for an answer that is always false.
      canUndo: hasArrived
        ? (await findRestorable(
            env.DB,
            event,
            table,
            activeZones(env.ZONE_SET).map((z) => z.key),
            since
          )).length > 0
        : false,
      narrative,
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
      const event = eventId(env);
      const gate = await assertCanSave(env, event, table);
      if (!gate.ok) return gate;
      const future = futureKey
        ? ALL_FUTURES.find((f) => f.key === futureKey)
        : undefined;
      if (futureKey && !future)
        return { ok: false as const, reason: "unknown future" };
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
      refreshQuietly(tableStatus({ table }));
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
    pushReply: v.optional(v.pipe(v.string(), v.maxLength(FREE_TEXT_MAX))),
  }),
  async ({ table, era, pushReply }) =>
    withTableLock(table, async () => {
      const env = requestEnv();
      if (!env) return { ok: false as const, reason: "no environment" };
      const event = eventId(env);
      const gate = await assertCanSave(env, event, table);
      if (!gate.ok) return gate;
      const answers = answersOf(await getCurrentAnswers(env.DB, event, table));
      const future = ALL_FUTURES.find((f) => f.key === futureOf(answers));
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
      refreshQuietly(tableStatus({ table }));
      return { ok: true as const };
    }),
);

const SaveAnswerInput = v.object({
  table: tableNo,
  /** A question id, or `<qid>:and` for a V4 "And:" sub-question's own row (game/questions.ts's `andId`). */
  questionId: v.string(),
  keys: v.array(v.string()),
  text: v.optional(
    v.record(v.string(), v.pipe(v.string(), v.maxLength(FREE_TEXT_MAX))),
  ),
  /** Where the Push line doubles as a typed capture field (V4: q2, q5c). */
  pushReply: v.optional(v.pipe(v.string(), v.maxLength(FREE_TEXT_MAX))),
});

export const saveAnswer = command(SaveAnswerInput, async (input) =>
  withTableLock(input.table, async () => {
    const env = requestEnv();
    if (!env) return { ok: false as const, reason: "no environment" };
    const gate = await assertCanSave(env, eventId(env), input.table);
    if (!gate.ok) return gate;
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
    refreshQuietly(tableStatus({ table: input.table }));
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
      const gate = await assertCanSave(env, eventId(env), table);
      if (!gate.ok) return gate;
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
      refreshQuietly(tableStatus({ table }));
      return { ok: true as const };
    }),
);


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

      const since = await getResetAt(env.DB, event, table);
      // The cap is about total spend per table, so it binds the first
      // submit as well as *Draw again* — a table that has burned its budget
      // has burned it whichever button spent it.
      const budget = await getRenderBudget(env.DB, event, table, since);
      const cap = checkRenderCap({
        used: budget.used,
        about: activeZones(env.ZONE_SET).length,
        max: maxRendersPerTable(env.MAX_RENDERS_PER_TABLE),
      });
      if (!cap.ok) return { ok: false as const, reason: cap.reason };

      await finishTableRow(env.DB, event, table);
      // Written after the response, like the first generation tick: the
      // table is submitted whether or not a model answers, and the read of
      // its answers happens off the response path too.
      requestWaitUntil(
        (async () => {
          const current = answersOf(
            await getCurrentAnswersSince(env.DB, event, table, since),
          );
          await ensureNarrative(env, event, table, current, since);
        })(),
      );
      const result = await queueGeneration(env, event, table, {
        composedOverride: composed,
        regenerate: false,
        since,
      });
      refreshQuietly(tableStatus({ table }));
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
  v.object({
    table: tableNo,
    composed: v.optional(v.string()),
    /**
     * "Change one thing" — the table's own words about the picture it is
     * looking at. Saved as an answer row BEFORE the redraw is queued, so the
     * composer picks it up through the normal path and the export has it.
     *
     * Same 140-character cap as the wildcard, applied here as well as in
     * `sanitizeComposed`, because a cap that only exists at composition time
     * lets an unbounded string into D1 first.
     */
    steer: v.optional(v.pipe(v.string(), v.maxLength(140)))
  }),
  async ({ table, composed, steer }) =>
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
      // *Draw again* redraws something. A table that has never submitted has
      // nothing to redraw, and letting it through meant anyone who could
      // reach a `/t/<n>` URL could burn that table's whole render budget on
      // an empty prompt without answering a single question.
      const regenState = await getTableState(env.DB, event, table);
      if (!regenState.submittedAt) {
        return {
          ok: false as const,
          reason: "Nothing to redraw yet — send your answers first.",
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

      // Both limits read the `image` table, never an in-isolate timer: a
      // recycled isolate, or simply a second one, would hand a double-tap
      // an empty timer and no limit at all (see `limits.ts`).
      const since = await getResetAt(env.DB, event, table);
      const budget = await getRenderBudget(env.DB, event, table, since);
      const cooldown = checkCooldown({
        lastRenderAt: budget.lastRenderAt,
        now: Date.now(),
      });
      if (!cooldown.ok)
        return { ok: false as const, reason: cooldown.reason };
      const cap = checkRenderCap({
        used: budget.used,
        about: activeZones(env.ZONE_SET).length,
        max: maxRendersPerTable(env.MAX_RENDERS_PER_TABLE),
      });
      if (!cap.ok) return { ok: false as const, reason: cap.reason };

      // The steer is written BEFORE the queue, never after: `queueGeneration`
      // composes from the answers as they stand when it runs, so a steer
      // saved afterwards would not reach the render it was typed for — it
      // would silently apply to the NEXT one.
      //
      // An empty steer clears the previous one rather than leaving it in
      // place. A table that asked for a change, got it, and now just wants
      // another roll of the dice should not keep re-applying last round's
      // instruction without being told it is still there.
      if (steer !== undefined) {
        const trimmed = steer.trim();
        await saveAnswerRow(env.DB, {
          eventId: event,
          table,
          questionId: STEER.id,
          keys: trimmed ? [STEER.options[0].key] : [],
          text: trimmed ? { [STEER.options[0].key]: trimmed } : undefined,
          actor: "table",
          source: "tap",
        });
      }

      const result = await queueGeneration(env, event, table, {
        composedOverride: composed,
        regenerate: true,
        since,
      });
      if (result.queued === 0 && result.inFlight > 0) {
        return {
          ok: false as const,
          reason: "Still drawing — wait for this one before asking for another.",
        };
      }
      refreshQuietly(tableStatus({ table }));
      return { ok: true as const, queued: result.queued };
    }),
);

/**
 * ONE ZONE, AGAIN.
 *
 * The 20-table run stored 76 of 80 zone images; four tables lost a single
 * zone each. Until now the only way back was *Draw again*, which redraws
 * all four and spends four of that table's twelve renders to recover one.
 * A table that has already been regenerated once can hit the cap trying to
 * fix one tile.
 *
 * So a failed tile can ask for itself. One render, the SAME prompt — read
 * back verbatim from the `image_detail` sidecar rather than recomposed, so
 * a retry cannot quietly become a different picture — and the same cap
 * accounting, counting one rather than four.
 *
 * Only a FAILED zone qualifies. A stored zone asking again is *Draw
 * again*'s job, and a queued or requested one already has an attempt in
 * flight; `insertQueuedImageIfIdle` would refuse it anyway, but refusing
 * here gives the phone something to say.
 *
 * The cooldown deliberately does NOT apply. It exists to stop a phone
 * being tapped repeatedly for a new picture; this is a repair of something
 * the room can see is broken, and making someone wait a minute to start it
 * is the wrong behaviour in front of a live table. The per-table cap still
 * binds, because that one is about spend.
 */
/**
 * GO BACK TO THE LAST ONE.
 *
 * v1's undo swapped two URLs in a client store — real to the table, gone on
 * reload, invisible to the wall. Here the earlier render is still a row and
 * its bytes are still in R2, so this restores it for real: a new `stored`
 * row pointing at the earlier object, superseding the one on screen.
 * Append-only, nothing rewritten, nothing deleted, and `/admin/photos`
 * still lists every picture that ever existed.
 *
 * IT SPENDS NOTHING, so it deliberately skips the cooldown AND the cap.
 * Both exist to bound money; going back to a picture already paid for costs
 * none, and making a table wait sixty seconds to undo a mistake in front of
 * a live room is the wrong behaviour.
 *
 * The room lock still applies — once the wall has moved on, a table
 * changing its picture underneath it is not undo, it is a surprise.
 */
export const undoRender = command(
  v.object({ table: tableNo }),
  async ({ table }) =>
    withTableLock(table, async () => {
      const env = requestEnv();
      if (!env) return { ok: false as const, reason: "no environment" };
      const event = eventId(env);
      if (await lockedAt(env.DB, event)) {
        return { ok: false as const, reason: "The room is closed — the screen has moved on." };
      }
      // A generation in flight would be superseded the moment it lands, so
      // the table would appear to undo and then watch it undo itself.
      if ((await getPendingImagesForTable(env.DB, event, table)).length > 0) {
        return { ok: false as const, reason: "Still drawing — wait for this one to land." };
      }
      const since = await getResetAt(env.DB, event, table);
      const items = await findRestorable(
        env.DB,
        event,
        table,
        activeZones(env.ZONE_SET).map((z) => z.key),
        since
      );
      if (items.length === 0) {
        return { ok: false as const, reason: "This is the only one you have drawn." };
      }
      const restored = await restoreImages(env.DB, event, table, items);
      refreshQuietly(tableStatus({ table }));
      return { ok: true as const, restored };
    }),
);

export const retryZone = command(
  v.object({ table: tableNo, zone: v.string() }),
  async ({ table, zone }) =>
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
      const zoneDef = zoneByKey(zone);
      if (!zoneDef) return { ok: false as const, reason: "unknown zone" };

      const since = await getResetAt(env.DB, event, table);
      const existing = await getCurrentImageSince(
        env.DB,
        event,
        table,
        zone,
        since,
      );
      // A zone with NO row since the reset is exactly the case the phone
      // now shows as failed, so the retry has to be able to act on it.
      // There is no prior attempt to copy a prompt from, so it composes one
      // the same way the first submit would have.
      const tableState = await getTableState(env.DB, event, table);
      const neverSent = !existing && !!tableState.submittedAt && tableState.submittedAt > since;
      if (!existing && !neverSent) {
        return { ok: false as const, reason: "Nothing to try again yet." };
      }
      if (existing && existing.state !== "failed") {
        return {
          ok: false as const,
          reason:
            existing.state === "stored" || existing.state === "done"
              ? "That one landed — use Draw again for a new set."
              : "Still drawing — give it a moment.",
        };
      }

      // One render, not four.
      const budget = await getRenderBudget(env.DB, event, table, since);
      const cap = checkRenderCap({
        used: budget.used,
        about: 1,
        max: maxRendersPerTable(env.MAX_RENDERS_PER_TABLE),
      });
      if (!cap.ok) return { ok: false as const, reason: cap.reason };

      // The exact text that was submitted, not a recomposition of it. If
      // there is no sidecar (a row from before it existed) or no row at all
      // (the never-sent case), compose from the table's current prompt the
      // same way the first submit would have.
      const detail = existing ? await getImageDetail(env.DB, existing.id) : null;
      let zonePrompt = detail?.prompt ?? "";
      const promptRow = existing
        ? await getPromptById(env.DB, existing.promptId)
        : await getLatestPrompt(env.DB, event, table, since);
      if (!zonePrompt) {
        if (!promptRow) {
          return { ok: false as const, reason: "Nothing to try again yet." };
        }
        const answers = answersOf(
          await getCurrentAnswersSince(env.DB, event, table, since),
        );
        zonePrompt = composePromptFor(zoneDef, {
          composed: promptRow.composed,
          negative: promptRow.negative,
          answers,
          futureKey: futureOf(answers),
          era: eraOf(answers),
          table,
        });
      }
      if (!promptRow) {
        return { ok: false as const, reason: "Nothing to try again yet." };
      }

      // Same single-statement guard every other queue path uses: two
      // isolates both reaching here produce one row, not two.
      const image = await insertQueuedImageIfIdle(
        env.DB,
        {
          eventId: event,
          table,
          zoneKey: zone,
          promptId: promptRow.id,
          prompt: zonePrompt,
          model: MODEL,
          actor: "table",
          supersedesId: existing?.id ?? null,
        },
        since,
      );
      if (!image) {
        return {
          ok: false as const,
          reason: "Already trying that one — hang tight.",
        };
      }

      const futures = await getTableFutures(env.DB, event);
      requestWaitUntil(
        tickImageRow(
          {
            db: env.DB,
            env,
            event,
            origin: requestOrigin(),
            futureKey: futures.get(table) ?? null,
            since,
          },
          {
            id: image.id,
            state: image.state,
            falRequestId: image.falRequestId,
            createdAt: image.createdAt,
            table,
            zoneKey: zone,
          },
          zonePrompt,
        ),
      );
      refreshQuietly(tableStatus({ table }));
      return { ok: true as const, queued: 1 };
    }),
);
