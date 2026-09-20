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

- [ ] Export D1 (`wrangler d1 export`), copy R2, index, retire per the data
      lifecycle SOP
