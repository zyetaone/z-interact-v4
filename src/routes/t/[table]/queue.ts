/**
 * QUEUE — one prompt row for the table, one `image` row per zone, then the
 * first tick.
 *
 * Split out of `answers.remote.ts` 22 Sep. This is the SPEND path, and it
 * is the one piece of that file that four different commands
 * (`finishTable`, `regenerate`, `retryZone`, and the simulator through
 * them) all funnel into. It changes when what we send to fal changes —
 * not when a screen does.
 */
import { WILDCARD, STEER } from '$lib/game/questions';
import { activeZones } from '$lib/game/zones';
import { eventId, requestWaitUntil } from '$lib/server/env';
import { getCurrentAnswers, getCurrentImageSince, insertPrompt, insertQueuedImageIfIdle } from '$lib/server/room';
import { tickImageRow, tickRowSafely } from '$lib/server/ticker';
import { sanitizeComposed } from '$lib/server/prompt';
import { getLatestPrompt } from './prompt-store';
import { composePromptFor } from './hero';
import { buildLayerInputs, composeBase, composeZonePrompt, resolveZone, eraOf } from './layers';
import { type Env, MODEL, answersOf, futureOf, tickContext } from './guards';


/**
 * Inserts ONE prompt row for the table (append-only, actor 'table'), then
 * one `image` row per zone in `ZONES`, then kicks the first tick for each
 * through `waitUntil`.
 *
 * `supersedesId` is set on a regenerate so the previous attempt stays in
 * the table rather than being overwritten — `getCurrentImage` reads the
 * newest row, so the new attempt becomes current the moment it is inserted.
 */
export async function queueGeneration(
  env: Env,
  event: string,
  table: number,
  opts: { composedOverride?: string; regenerate: boolean; since: number },
): Promise<{ promptId: string; composed: string; queued: number; inFlight: number }> {
  const answers = answersOf(await getCurrentAnswers(env.DB, event, table));
  const layers = buildLayerInputs({
    futureKey: futureOf(answers),
    era: eraOf(answers),
    answers,
    table,
  });
  // A table-edited prompt is free text that becomes the ENTIRE prompt sent
  // to fal and then shown on a public screen. It is capped and stripped
  // here as well as in `composeZonePrompt`, so the `prompt` row stores what
  // was actually submitted rather than the raw paste.
  const edited = !!opts.composedOverride?.trim();
  const composed = sanitizeComposed(
    edited ? opts.composedOverride! : composeBase(layers),
  );
  // Scoped, so a fresh run's first prompt does not claim to supersede the
  // prompt of the room that was reset away. The append-only chain is the
  // record of one run's edits, not a bridge across the reset.
  const previous = await getLatestPrompt(env.DB, event, table, opts.since);

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
  let inFlight = 0;
  for (const zone of activeZones(env.ZONE_SET)) {
    // SINCE THE RESET, not ever. `getCurrentImage` ignores the reset
    // watermark, and image rows are append-only, so after a desk Reset a
    // zone's pre-reset `stored` row still read as current and this skipped
    // it. Live, table 20 was reset, walked again, and submitted: only
    // `garden` — the one zone whose prior row had FAILED, and so passed the
    // test below — got a new row. The other three were silently never sent
    // and the phone showed them drawing for ever. The insert underneath
    // already applies the watermark; this read did not.
    const existing = await getCurrentImageSince(
      env.DB,
      event,
      table,
      zone.key,
      opts.since,
    );
    // "A generation already in flight is returned, not duplicated"
    // (game-flow §8) — but a regenerate deliberately supersedes a FINISHED
    // attempt. Neither case may start a second attempt while one is live.
    if (!opts.regenerate && existing && existing.state !== "failed") continue;

    // The hero gets its own composer (`hero.ts`); a functional zone gets the
    // base plus its moment. One chooser, so every submit path agrees.
    const zonePrompt = composePromptFor(zone, {
      composed,
      negative: layers.negative,
      answers,
      futureKey: futureOf(answers),
      era: eraOf(answers),
      table,
    });
    // The check and the write are ONE statement (`insertQueuedImageIfIdle`).
    // The read-then-write above is per-isolate and two isolates can both
    // pass it — that is the double-tap that queued two full sets per table.
    // A null return means another isolate got there first; its attempt is
    // the one this call returns, rather than a second one being started.
    const image = await insertQueuedImageIfIdle(
      env.DB,
      {
        eventId: event,
        table,
        zoneKey: zone.key,
        promptId,
        prompt: zonePrompt,
        model: MODEL,
        actor: "table",
        supersedesId: existing?.id ?? null,
      },
      opts.since,
    );
    if (!image) {
      inFlight += 1;
      continue;
    }
    queued += 1;

    // waitUntil kicks the first tick; the phone/admin polls and the
    // webhook are the safety net if it is cut short (game-flow §6).
    requestWaitUntil(
      tickImageRow(
        tickContext(env, event, futureOf(answers), opts.since),
        {
          id: image.id,
          state: image.state,
          falRequestId: image.falRequestId,
          createdAt: image.createdAt,
          table,
          zoneKey: zone.key,
        },
        zonePrompt,
      ),
    );
  }
  return { promptId, composed, queued, inFlight };
}
