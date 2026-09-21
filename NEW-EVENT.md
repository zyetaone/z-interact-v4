# New event checklist

Run through this once per event before the doors open. `event_id` is a column
on every table, so the archive step at the end needs no bespoke loader.

## Resources

- [ ] New D1: `<event>-db` (not a shared/rename) — `wrangler d1 create <event>-db`,
      then paste the returned `database_id` into `wrangler.jsonc`
- [ ] New Pages project: own name, own custom domain
- [ ] New R2 bucket: `<event>-images` — paste the bucket name into `wrangler.jsonc`.
      A fresh bucket per event is the simplest path; if one is reused, note that
      `/projector/img/[...key]` scopes reads to the current `EVENT_ID` prefix,
      so a stale key from a previous event 404s rather than serving
- [ ] `nodejs_als` compatibility flag present (`getRequestEvent()` is used
      throughout)
- [ ] Workers AI binding present (`"ai": { "binding": "AI" }` in
      `wrangler.jsonc`) — it writes the phone done screen's read-back
      paragraph and nothing else. Absent, the paragraph simply never appears
- [ ] *Optional* pre-warm of the `narrative` table, so it exists before the
      first phone submits (the app creates it on first use either way):
      `wrangler d1 execute <event>-db --remote --file=migrations/0001_narrative.sql`

## Secrets and variables

Every secret below goes in with `wrangler pages secret put <NAME> --project-name <project>`.
`wrangler secret put` (no `pages`) is the plain-Workers command; it does **not**
reach a Pages project and leaves the value unset, where a perfectly good key
reads exactly like a dead one.

| Name | Kind | Unset behaviour |
|---|---|---|
| `FAL_KEY` | secret | every render fails |
| `FAL_WEBHOOK_SECRET` | secret | **fails closed** — the webhook route rejects every callback, and no webhook URL is registered at submit time, so rows fall back to poll-only. Slower, still correct |
| `ADMIN_TOKEN` | secret | **fails closed in production** (open in `dev` only) — `/admin` rejects every command |
| `EVENT_ID` | var | falls back to `dev-event`; set it to `<app>-<YYYY-MM>` |
| `MAX_RENDERS_PER_TABLE` | var | falls back to **12**, never to "no cap". Unparseable values also fall back rather than disabling the cap |
| `SIMULATE_ENABLED` | var | the rehearsal route is off unless this is exactly `true` |
| `PUBLIC_EVENT_TITLE` | var | the Lobby beat reads "Twenty Tables" |
| `FAL_RESOLUTION` | var | falls back to **1K**. Anything unrecognised falls back too, rather than being passed through to the provider |
| `ADMIN_TICK_BUDGET` | var | falls back to **8** — how many pending rows one admin poll advances after it has answered. Never unbounded |
| `AI_FAKE` | var | unset means the real Workers AI binding writes the done screen's paragraph. `1` writes a deterministic stand-in and never calls the binding — set it locally, never in production |
| `FAL_FAKE` | var (process env, not a Pages var) | unset means real fal calls. `1` short-circuits submit/poll/fetch in `fal.ts` and returns a fake image with no network call — dev/rehearsal only, **set it in the SHELL** (`FAL_FAKE=1 npm run dev`), never on the Pages project. NOT `.dev.vars`: `fal.ts`'s `falFake()` reads `process.env`, and under `vite dev` `.dev.vars` is loaded into the PLATFORM env (`platform.env`) instead — verified 21 Sep, a rehearsal with `FAL_FAKE=1` in `.dev.vars` called the provider for real. With a live `FAL_KEY` beside it that is a rehearsal you are paying for while believing it is free. Confirm it is **not** set on the deployed project before the doors open; `FAL_KEY` set with `FAL_FAKE` also set silently draws nothing |
| `ZONE_SET` | var | falls back to **`hero`** — ONE main workspace image per table, which is what the wall and the phones show. `four` renders the four functional zones instead, `all` renders five. Anything unrecognised falls back to `hero` rather than to "everything", so a typo cannot quintuple what the room spends |
| `REFERENCE_MODE` | var | falls back to **`none`** — and so does any unrecognised value, so a typo cannot turn image anchoring on. See below |

- [ ] `FAL_KEY` set and confirmed live/billable
- [ ] `FAL_WEBHOOK_SECRET` set — used as the webhook URL's shared-secret query param
- [ ] `ADMIN_TOKEN` set — `/admin?token=...` is the only way in
- [ ] `EVENT_ID` set to `<app>-<YYYY-MM>`
- [ ] `MAX_RENDERS_PER_TABLE` reviewed against the budget (see below)
- [ ] `SIMULATE_ENABLED` unset (or anything but `true`) **before the doors open**
- [ ] `ZONE_SET` left unset unless the room deliberately wants the four zones
      back. Unset means one image per table — see *One image per table* below
- [ ] `REFERENCE_MODE` left unset unless the mood match has been judged on a real table
- [ ] `ADMIN_TICK_BUDGET` left unset unless the desk is deliberately carrying more of the room
- [ ] `FAL_RESOLUTION` reviewed — it multiplies the per-render cost
- [ ] `PUBLIC_EVENT_TITLE` set, or the Lobby beat reads "Twenty Tables"
- [ ] `AI_FAKE` **unset** in production (it is a local switch; set it in
      `.dev.vars` so `npm run dev` never spends on inference)
- [ ] `FAL_FAKE` **unset** in production and on the deploy worktree's env —
      it is a process-env dev switch (`.dev.vars`), not a Pages secret, so
      there is no dashboard toggle to check; verify by confirming it is
      absent from `.dev.vars`/shell env on whatever machine runs the deploy

There is no `PUBLIC_ORIGIN`. The app derives its origin from the request, so
the fal webhook URL is correct on whatever domain the deploy answers on, and
there is nothing to set or to get wrong.

## One image per table

The wall shows **one main workspace image per table**, not four. Each render
is an elevated three-quarter view of that table's whole workplace, composed
from their own selections (`routes/t/[table]/hero.ts`), and the phone shows
it with the narrative paragraph underneath — the text that says how the
picture follows from what they chose.

What this changes on the night:

- **The reveal beat** pages one tile per table, five across the LED band.
- **The focus beat** shows that one image full frame, with no words on it —
  not even the table number. The lens is a colour, as in every beat.
- **The desk** shows one image column per table and one Redraw per table;
  the per-zone Redraw appears only when `ZONE_SET` is `four` or `all`.
- **Spend.** One render per submit instead of four, so
  `MAX_RENDERS_PER_TABLE` (default 12) is now roughly twelve attempts per
  table rather than three. It is a cap on renders, not on submits, and it
  was not lowered — review it against the budget rather than assuming the
  old arithmetic.
- `?fixtures=1` shows this layout; `?fixtures=four` shows the four-zone one.

## How much the lens picture decides the render

`REFERENCE_MODE=none` (the default) renders every zone from text alone: four
distinct rooms, mood carried by the shared base prompt, no zone waiting on
another. `lens` anchors only zone 1 to the chosen lens picture; `chain`
anchors zones 2-4 to zone 1 as well, which matches the lens mood most closely
but makes all four zones the same composition with small edits, because the
edit endpoint reproduces a reference's framing rather than recomposing.

## Nothing renders unless something is polling

The simulator submits rows; it does not carry them. A row advances only
when a ticker touches it, and there are three: the phone's own 2 s poll,
the fal webhook, and the admin page's 3 s poll. A rehearsal with no phones
in the room therefore needs **the admin page open**, or the rows sit
queued and nothing appears on the wall. The admin poll advances
`ADMIN_TICK_BUDGET` rows at a time, after it has answered, so a room full
of pending rows drains over several polls rather than in one.

## Go / no-go, on the day

Three probes. Each one discriminates a correctly configured deploy from a
broken one **without printing a secret**, so they can be run from the venue
wifi with someone reading over your shoulder. Any other answer is a no-go.

The first two were run against a local build of this commit and returned
401 and 404. That is what makes them worth running against the deploy: the
answer is known, so a different one is a finding rather than a puzzle.

| Probe | Correct answer | What another answer means |
|---|---|---|
| `curl -si -X POST https://<domain>/api/fal-webhook?image_id=x` | **401** | Anything else: `FAL_WEBHOOK_SECRET` is unset or the route is not the hardened one. A 200 means anyone can write images into the room |
| `curl -si https://<domain>/projector/img/<some-other-event>/x` | **404** | A 200 means the projector will serve another event's bucket contents. Note what this probe does and does not prove: a missing object in *this* event answers 404 too, so the 404 confirms nothing is served, not that the prefix check ran. The prefix check itself is covered by unit tests; this probe is here to catch a deploy that serves the bucket wide open |
| Open `/admin?token=wrong` | **empty room**, no tables | Tables visible means `ADMIN_TOKEN` is unset and the desk is open to anyone with the URL. Run this against the real deploy, never `npm run dev`: an unset token fails OPEN in dev on purpose, so a local run shows the room and tells you nothing |

- [ ] Webhook probe returns 401
- [ ] Foreign-event image probe returns 404
- [ ] `/admin?token=wrong` shows an empty room
- [ ] The three probes were run against the REAL domain, not a preview URL

## Spend

Two limits live in the app; one lives at fal. Set all three.

- **Per-table cap** — `MAX_RENDERS_PER_TABLE`, default 12, counted across the
  first submit and every regenerate, per table, since that table's last reset.
  With four zones that is the first draw plus two redraws. It binds the phone
  AND the desk; `resetTable` is the desk's way past it.
- **Regenerate cooldown** — 60 s per table, derived from the newest image row
  rather than an in-isolate timer. Not configurable; change
  `REGENERATE_COOLDOWN_MS` in `src/lib/server/limits.ts` if a run needs it.
- [ ] **A hard spend cap on the fal account dashboard.** This is the only one
      of the three that survives a bug in the other two. Outside this repo.

## Rehearsal

Run it before the site-tech window, not during (game-flow.md §8).

```bash
# Dry run: answers only, no renders, costs nothing even with a live key.
curl -sS -X POST https://<domain>/simulate \
  -H 'content-type: application/json' \
  -d '{"token":"<ADMIN_TOKEN>","tables":20,"seed":1,"staggerMs":250,"answersOnly":true}'

# Full run: REAL renders, subject to MAX_RENDERS_PER_TABLE.
curl -sS -X POST https://<domain>/simulate \
  -H 'content-type: application/json' \
  -d '{"token":"<ADMIN_TOKEN>","tables":20,"seed":1,"staggerMs":250}'
```

**Run a real-render rehearsal in fives, not all twenty at once.** One
Cloudflare invocation has a cap on D1 calls, and each table's renders add
their own to the same request, so a full room with real renders exceeds it
and the run reports refusals that are an artefact of the harness rather
than of the app. Use `from` to window it: `{"from":1,"tables":5}`, then 6,
11, 16. Answers-only is much lighter and goes in halves of ten. Plans are
seeded across the whole room, so the windows drive the same tables a single
run would have.

Needs `SIMULATE_ENABLED=true` and a matching `ADMIN_TOKEN`; both fail closed.
The response carries `submitted`, `rendersQueued`, every refusal, and
`disagreements` — tables whose reported submit disagrees with what the room
reads back. **`disagreements` must be empty.** Same `seed` replays the same
room, so a fix can be confirmed rather than hoped for.

- [ ] Rehearsal run, `disagreements` empty, refusals understood
- [ ] Real-render rehearsal run in windows of five
- [ ] The admin page was open throughout — see *Nothing renders unless
      something is polling*. A rehearsal with no phones and no desk submits
      rows that then sit queued
- [ ] `SIMULATE_ENABLED` turned back off afterwards

## Facilitator runbook — what you see, what to press

Written for the desk, not for a developer. Every row: what you SEE, what to
PRESS, and what that will and will not do. Read the next subsection —
Reopen vs Regenerate vs Reset — before the doors open, not while a table is
watching you.

### The one-glance check: `/health`

Before touching anything, or when you are not sure the room is moving at
all, run this from the desk machine or a phone on venue wifi. It never
prints a secret and it never spends fal money — it only reads D1.

```bash
curl -s "https://<domain>/health?token=<ADMIN_TOKEN>"
```

```json
{
  "ok": true,
  "eventId": "…",
  "beat": "progress",
  "focusTable": null,
  "pending": 3,
  "failedRecent": 0,
  "failedWindowMinutes": 10,
  "submitted": 14,
  "tables": 20
}
```

| Field | Means | Bad value looks like |
|---|---|---|
| `ok` | Your token was accepted | `false` with HTTP 401 — wrong token, or `ADMIN_TOKEN` unset on the deploy (fails closed) |
| `beat` | What the projector is currently showing | Not what you just set on the desk — see "the wall looks wrong" below |
| `focusTable` | Which table is on the focus beat | Set when you didn't mean to focus anyone |
| `pending` | Renders still in flight across the whole room right now | A number that never drops between two checks a minute apart — the room has stopped moving |
| `failedRecent` | Renders that failed in the last `failedWindowMinutes` (10) | Anything above roughly 2-3 at once — one or two failed zones is normal spend, a cluster in the same window is the "every table fails at once" case below |
| `submitted` | Tables that have submitted at least once | Lower than you expect for how far into the event you are |

`/health` never ticks anything — it is a pure read. Running it twice never
makes anything worse, and it costs nothing.

### Symptom → lever

**A table's image failed (one tile, one table).**
SEE: on the desk's room table, that table's Images cell shows "Redraw
`<zone>`" next to the count, with the failure reason on hover. On the
table's own phone, that image tile reads failed with a reason instead of
"being drawn".
PRESS: the per-zone **Redraw** button on that row (arm it, then **Confirm
redraw**). It queues exactly one render for that one zone, using the exact
prompt that failed — not a fresh composition — and counts one against that
table's render cap, not four.
It will: fix that one tile without touching the table's other images or
answers. It will not: change anything else on the table, and it will not
work while that zone is not currently `failed` (a zone that's still
drawing, or already stored, has nothing for Redraw to act on — the button
does not appear for it).

**A table submitted and nothing is happening at all — no "being drawn",
no image, no error.**
SEE: the row on the desk shows 0/N images and no failed-zone button; the
table's phone still shows the images screen with nothing progressing.
PRESS: nothing, first — reload the admin tab. Rendering only advances when
something polls it (phone's 2 s poll, the fal webhook, or the desk's own
3 s poll), so if the admin tab was closed or crashed, nothing was ticking
that table at all; reopening it resumes every table, not just this one.
If it still shows nothing after 10-15 seconds with the admin tab open,
check `/health`'s `pending` — 0 pending for a table that just submitted
means the submit itself didn't queue anything, which is a genuine bug, not
a stuck render. Escalate rather than pressing Reset speculatively.

**A render is stuck part-way, and both the desk's Redraw and the table's
own "Draw again" refuse it as still drawing.**
Be honest about this one: there is no timeout for a `requested` row that
never gets an answer from the provider except the very long stale-claim
window in the code (minutes, not something you wait out at a live desk).
There is no button that cancels an in-flight render.
PRESS: **Reset** on that table — arm it, then **Confirm reset**. This is
not a small nudge; read the next section before you press it. It is the
only lever that gets that table unstuck, and it costs the table's answers
and its current images.

**Every table's render fails at once.**
SEE: `/health`'s `failedRecent` is high across many tables at the same
time, not concentrated on one. This means the fal account, not the app —
a dead API key, an exhausted account cap, or fal itself is down.
PRESS: nothing on the desk fixes this. Redraw, Regenerate and Reset all
submit to the same fal account; if fal is refusing every request they will
all fail the same way, and Reset in particular will burn a table's answers
for a render that still won't happen. Check the fal dashboard directly
(the hard spend cap mentioned in *Spend* above is the first place a whole-
account failure shows up). Tell the room what's happening rather than
working the desk — a facilitator visibly pressing buttons that don't
change anything reads worse than an honest pause.

**The wall looks wrong, or isn't moving.**
PRESS, in order: (1) reload the projector browser tab — this is the first
move, and fixes a wedged or stale render more often than anything on the
desk; (2) confirm the projector URL has no `?beat=`/`?table=` query string
— either one puts it in manual-override mode with a small "manual —
ignoring the desk" badge, and it will stop following the desk's beat
entirely until removed; (3) check `/health`'s `beat` matches what you just
pressed on the desk — if it doesn't, the desk's command didn't land, not
the projector's poll.

**A table needs to change an answer after submitting.**
PRESS: **Reopen** on that table. This is the only one of the three verbs
that keeps the table's existing answers and images — see the next section.
It grants a one-shot permission to submit again; the table can then go
back through its screens and change what it needs to, and its next submit
consumes the grant.

**You pressed the wrong button on the wrong table.**
There is no undo. What you can do depends on which button:
- Wrong **Reopen** — harmless. It only grants permission to resubmit; if
  the table never uses it, nothing changes. Leave it.
- Wrong **Redraw** on a working zone — it will not have offered you the
  button unless that zone was already `failed`, so this case mostly can't
  happen from the desk's own UI. If you triggered a regenerate/redraw
  intending a different table, it queued one real render on the wrong
  table's cap; there is no way to un-spend it, only to note the table's
  budget is one lower than expected.
- Wrong **Regenerate** — queues a full new render set on the wrong table,
  spending one full cycle of its cap. Not reversible. Tell that table
  their picture is about to change again.
- Wrong **Reset** — this is the one that matters. See the next section
  before you ever arm it: it is not recoverable from the desk. The
  table's prior answers and images stay in D1 forever (nothing is
  deleted), but they stop being what the app shows or uses, and the table
  must answer all eleven questions again to get a new image.

### Reopen vs Regenerate vs Reset — read this once, remember it

This distinction used to live only in code comments. It is the single
most consequential thing on this page.

| Verb | What it keeps | What it costs | When to use it |
|---|---|---|---|
| **Reopen** | Everything. Answers, current images, render budget spent so far — all untouched. | Nothing. It only grants a one-shot permission to submit again. | A table wants to change an answer after submitting, and the room isn't locked against them. |
| **Regenerate** | The table's answers and prompt. Draws a fresh image set from the same answers (or the desk's per-zone Redraw, one tile). | One render against that table's cap (or one per zone if using the whole-row Regenerate, not the per-zone Redraw). | The picture came out wrong, or one tile failed, but the answers are still right. |
| **Reset** | Nothing currently visible. It appends a watermark to that table's timeline; every read in the app — the phone, the desk, the projector — only shows what happened *since* the table's most recent reset. The table's existing image stops being shown anywhere. | The table's whole answer set. It must go through all eleven questions again before it can draw anything new. | The render is stuck with no other lever (see above), or the table's data needs to be fully thrown away and restarted — never as a way to "try again" on a table that's otherwise fine. |

**Reset is not an undo.** Nothing is deleted from D1 — every prior answer,
prompt, and image row stays in the database forever, append-only — but the
app stops reading any of it for that table. From the table's and the
wall's point of view, the table goes back to question one with no image.
If you want a different picture from the *same* answers, that is
Regenerate, not Reset. Reaching for Reset because a table's picture looks
off, when a plain Regenerate or a targeted Redraw would have done it,
throws away eleven answered questions for nothing.

## The night itself

- [ ] Confirm table count / range (`TABLE_COUNT` in `src/lib/game/questions.ts`)
      matches the venue's printed QR tent cards
- [ ] Open `/admin?token=...` on the desk machine. **The projector follows the
      desk**: pressing a beat changes the wall on its next 3 s poll. Beats are
      lobby · progress · reveal · finale · focus (focus needs a table)
- [ ] `/projector` open on the wall with NO query string. `?beat=` / `?table=`
      are a manual override for a dead admin tab, and the wall shows a small
      "manual — ignoring the desk" badge while either is set
- [ ] `?fixtures=1` renders every beat with fake data and no D1/R2 — use it to
      check the projector's geometry on the real screen before the room fills

## After

- [ ] Export D1 — `--remote` and `--output` are both required; without
      `--remote` this exports the empty local dev database, not the event's
      real data:
      ```bash
      wrangler d1 export <event>-db --remote --output=<event>-$(date +%F).sql
      ```
- [ ] Copy the R2 bucket, index, retire per the data lifecycle SOP

## Deploying from the release worktree

Deploys are cut from `~/Developer/zyetaone/_deploy/v4-release`, a separate
detached-HEAD git worktree of this repo — not this checkout — because
deploying from a branch checkout risks the "head" branch-name bug in
`CLAUDE.md`'s deploy command. That worktree's `wrangler.jsonc` carries the
real event's D1 `database_id`, which this repo's `wrangler.jsonc`
deliberately leaves as a placeholder. **This is how config drifts**: a
binding, compat flag, or var added here is invisible there until someone
re-syncs it.

- [ ] `git -C ~/Developer/zyetaone/_deploy/v4-release fetch && git -C
      ~/Developer/zyetaone/_deploy/v4-release checkout <the commit being
      shipped>`
- [ ] Diff `wrangler.jsonc` between this checkout and the deploy worktree;
      carry forward everything except the per-event `database_name` /
      `database_id` / bucket name
- [ ] Run the deploy command (`CLAUDE.md`'s Commands section) from inside
      the deploy worktree, with `--branch main`

## Table cards (the QR codes)

The app tells people to scan a card on their table, in three places, and it does not produce that
card. It is made outside the repo and printed.

The current set is `print/table-qr-cards-A4.pdf` in the event's strategy folder: twenty pages, one
A4 per table, each carrying the table number, its QR code and the plain URL as a fallback for a
phone that will not scan. Each code points at `https://<deployment>/t/<n>`.

**For a new event, regenerate them, because the host changes.** The codes are made with `segno` and
every one is decoded back before it is used. That check is not ceremony: one of the twenty was a
valid code that would not read at any size with the decoder, while the other nineteen read fine,
and it needed a different mask. A card that does not scan is a table that cannot start, and you
will not discover it until twenty people are sitting in front of it.

So the rule is: generate, decode every code back at several sizes, and only print the ones that
round-trip.

The client's standing format, unchanged across events, is one board and one A4 sheet per table with
the table number and the QR code, kept as simple as possible. Do not redesign it.

## Two probes to run on the morning, before anyone arrives

**Is the image account alive?** This has taken a gallery down twice at this client's events, most
recently two nights before the September symposium, and it looks like the app is broken when it is
not. Ask the queue for a request that cannot exist:

```
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Key $FAL_KEY" \
  https://queue.fal.run/fal-ai/nano-banana-2/requests/00000000-0000-0000-0000-000000000000/status
```

`404` is the answer you want: the key authenticated and the request genuinely does not exist. `401`
means the key is wrong or unset. `403` means the account is locked or out of balance, which is the
failure that has actually happened, and no amount of retrying inside the app will fix it. The probe
costs nothing because it never submits a render.

Also open the provider's dashboard and confirm a hard spend cap is set. It is the only ceiling that
survives a bug or a leaked admin token in this app.

**Does the wall fit the wall?** Measured across six geometries against the live site, the projector
picks five tiles per page on a wide band and four on a conventional screen, and never overflows in
either direction:

| Viewport | Tiles per page | Table number |
|---|---|---|
| 5760x1080 | 5 | 119 px |
| 4800x1080 | 5 | 119 px |
| 3840x1080 | 5 | 119 px |
| 2560x1440 | 4 | 158 px |
| 1920x1080 | 4 | 119 px |
| 1366x768 | 4 | 84 px |

So the exact pixel size of the venue's wall is not a risk to the layout. Open `/projector` on the
real wall during the tech window anyway, and check the two things a measurement cannot: that the
tiles reach the edges of the physical panel rather than sitting in a letterbox, and that the table
numbers read from the far side of the room.
