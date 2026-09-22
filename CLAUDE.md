# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# z-interact-v4

A fresh SvelteKit app for a 20-table interactive workshop: each table scans a
QR code, answers a short multiple-choice questionnaire, an image model draws
that table's workspace per functional zone, and a projector shows the
gallery finale. No client, event, or people names appear in this repo —
generically "the event" and "the question owner". Per-event names and dates
live in `NEW-EVENT.md`'s checklist, filled in outside this repo.

## Stack

| Package | Version |
|---|---|
| `@sveltejs/kit` | 2.70.3 |
| `svelte` | 5.57.1 |
| `@sveltejs/adapter-cloudflare` | 7.2.9 |
| `valibot` | 1.5.0 |
| `wrangler` | 4.135.0 |
| `vitest` | 5.0.1 |
| `qrcode` | 1.5.4 |
| `@cloudflare/workers-types` | 5.20260919.1 |
| `clsx` | 2.1.1 |
| `@playwright/test` | ^1.63.0 (e2e only) |

Remote functions (`query`/`command`/`form` from `$app/server`) are the RPC
layer, opted into via `svelte.config.js`'s `kit.experimental.remoteFunctions`
+ `compilerOptions.experimental.async` — both required, only picked up from
that file (not `vite.config.ts`). No ORM (raw D1, `CREATE TABLE IF NOT
EXISTS`). No `@fal-ai/client` (raw `fetch` against `queue.fal.run`). No UI
kit (plain CSS).

## Commands

```bash
npm install
npm run dev          # vite dev, platformProxy emulates D1/R2 locally
npm run check         # svelte-kit sync + svelte-check
npm run test          # vitest --run (the `server` project: src/**/*.test.ts, node env)
npm run test:unit     # same, in watch mode
npx vitest --run src/lib/server/secret.test.ts   # one file
npx vitest --run -t 'ticking a stored row'       # one test by name
npm run build         # vite build -> .svelte-kit/cloudflare
wrangler pages dev .svelte-kit/cloudflare        # exercise the built output, not vite dev
```

`cp .dev.vars.example .dev.vars` before the first `npm run dev` — it lists
every variable and what unsetting it does.

**`wrangler d1 execute --local` and `npm run dev` fight over one SQLite
file.** Wrangler starts its own miniflare against `.wrangler/state`, which
the dev server already has open, and a write from one makes D1 reads fail
inside the other:

```
D1_ERROR: Failed to parse body as JSON, got: Error: internal error
```

Measured 22 Sep: 1 request in 30 failed that way during two `npm run
flow:reset` calls, from `getCurrentImage` and `getLatestPrompt` — two
innocent reads with nothing in this repo's code at fault. It clears on its
own, which is what makes it worth knowing: the symptom reads as a database
bug and is a second process. `flow:reset` now warns when the dev server is
up. **Local only** — production D1 is a Cloudflare service, not a file two
processes can open.

E2E (Playwright, `tests/e2e/`, not part of `npm run test`):
```bash
npx playwright test                              # all
npx playwright test tests/e2e/phase1-answers.spec.ts
```
The phone specs drive a dev server you start yourself on **5173**;
`projector-screens.spec.ts` boots its OWN on **5273** with `--strictPort`
and no reuse — the config comment records why (an earlier run photographed a
different worktree's 5173 and the captures showed code this branch does not
contain). `docs/screens/` and `docs/fidelity/` are the committed output.

Deploy (manual, not wired to CI yet):
```bash
wrangler pages deploy .svelte-kit/cloudflare --project-name <project> --branch main
# --branch main is not optional: from a detached-HEAD checkout wrangler names the branch "head"
# and the upload lands on a preview URL while production keeps serving the old build (seen 20 Sep).
wrangler pages secret put FAL_KEY --project-name <project>
wrangler pages secret put FAL_WEBHOOK_SECRET --project-name <project>
wrangler pages secret put ADMIN_TOKEN --project-name <project>
```

**The real deploy is cut from a separate worktree, not this checkout.**
`~/Developer/zyetaone/_deploy/v4-release` is a detached-HEAD git worktree of
this same repo, kept because a deploy from a branch checkout risks the
"head" branch-name bug above. Its `wrangler.jsonc` carries the real event's
D1 `database_id` and database name — values this repo's `wrangler.jsonc`
deliberately leaves as `REPLACE_WITH_NEW_D1_ID` placeholders (per-event
values are outside this repo). That split is exactly how a config can drift:
a change made in this checkout's `wrangler.jsonc` (a binding, a compat flag,
a new var) is invisible on the deploy worktree until someone re-syncs it.
Before every deploy, diff the two `wrangler.jsonc` files and carry forward
anything that changed here besides the per-event identifiers.
`NEW-EVENT.md` has the full variable table and what each one's absence does.
All three secrets above FAIL CLOSED when unset in production.
`wrangler secret put` (no `pages`) does **not** reach a Pages project — it
leaves the key unset in production, which then looks exactly like a dead key.

### The knobs, in one place

`NEW-EVENT.md` is authoritative; this is the index.

| Variable | Absent means |
|---|---|
| `FAL_KEY` / `FAL_WEBHOOK_SECRET` / `ADMIN_TOKEN` | fail closed in production |
| `EVENT_ID` | the `event_id` stamped on every row |
| `MAX_RENDERS_PER_TABLE` | falls back to 12, never to "no cap" |
| `REFERENCE_MODE` | `none` \| `lens` \| `chain`; unrecognised falls back to `none` |
| `ADMIN_TICK_BUDGET` | rows the admin read advances in `waitUntil`, default 8 |
| `SIMULATE_ENABLED` | `/simulate` rejects unless `'true'` |
| `PUBLIC_EVENT_TITLE` | the wall's Lobby headline. Falls back to **"The Cognitive City Vision"** — the subject, not the furniture (it used to fall back to "Twenty Tables"). A real event's own name goes here, never in the repo |
| `BRAND_LINE` | the line under the waiting screen and the front page. **Unset renders nothing** — this repo carries no company name, so the brand is a deploy value like `EVENT_ID` |
| `FAL_FAKE=1` / `AI_FAKE=1` | the two dev fakes — no image call, no Workers AI call. `FAL_FAKE` must be set in the SHELL, not `.dev.vars`: it is read from `process.env` and `.dev.vars` lands in `platform.env` (see NEW-EVENT.md) |

**`platformProxy` proxies the `AI` binding to the REAL remote one under
`npm run dev`** (D1 and R2 are local). `AI_FAKE=1` is what keeps a local run
off it; `FAL_FAKE=1` is the same trick for renders.

## Folder map

```
src/lib/server/
  env.ts       # ONLY file importing $app/server. requestEnv()/envOf()/eventId()/requestOrigin()/requestWaitUntil()
  d1.ts        # ensureTable/isTransientD1Error — takes D1Database as an argument, no $app/server
  gate.ts      # decideSubmit (pure) + D1-backed room lock / table-reopen wrappers
  room.ts      # event_table/answer/prompt DDL + CRUD, table state, the reset watermark,
               #   the batched admin read. Re-exports image.ts + beat.ts, so `$lib/server/room`
               #   is still the one import a caller needs. Does NOT re-export archive.ts
  image.ts     # the `image` row and its compare-and-swap. Split out of room.ts 22 Sep because
               #   it moves when the generation state machine moves and at no other time
  archive.ts   # what happens to a room BETWEEN events: exportRoomRows, resetRoom (watermarks),
               #   clearRoom (the only DELETE), findRestorable/restoreImages (the phone's Undo).
               #   Imported directly, never through room.ts — that would be an import cycle, and
               #   keeping it separate keeps the DELETE off every read path
  beat.ts      # room_beat — the projector's stage direction. The show, not the room
  generate.ts  # tick() — the resumable generation state machine, pure, deps-injected
  ticker.ts    # tickAndPersist()/realGenerateDeps()/buildWebhookUrl() — the one ticker impl, shared by all three callers
  r2.ts        # image key scheme (keyed by image row id) + put/get (see its ponytail note re: tiles)
  fal.ts       # queue.fal.run submit/status/result over raw fetch
  prompt.ts    # composeLayers — pure, content-free layer ordering
  throttle.ts  # createThrottle() — an in-isolate optimisation, NOT a guard (see its note)
  limits.ts    # pure spend rules: per-table render cap + regenerate cooldown
  fetch-image.ts # the ONE place image bytes come off the internet: host allow-list, byte cap, type sniff
  secret.ts    # constant-time secret compare, hand-written (no Cloudflare-only API)
  admin-gate.ts # the ONE ADMIN_TOKEN rule. `devOpen` is opt-in, per call site
  simulate.ts  # the PURE rehearsal plan (seeded); the route drives it through the real commands
  analytics.ts # PURE: summarise(exportRoomRows) -> answer distribution, lens split, progress, spend
  reference.ts # REFERENCE_MODE — how much the chosen lens picture decides the render
  fake-d1.ts   # an in-memory D1Database for the tests; no test talks to a real binding
src/lib/game/
  questions.ts # the FOUR surviving questions (q2, q8, q5c, q6r) + wildcard + STEER.
               #   No slider on q8 any more (None/20%/40%). Every push field is OPTIONAL.
  futures.ts   # FOUR offered futures + RETIRED_FUTURES (the two withdrawn, still resolvable
               #   via ALL_FUTURES) + era + lightLine
  zones.ts     # the zone sets behind ZONE_SETS (+ RETIRED_ZONES for historical rows)
  era.ts       # the era scale + allowedEras/nudge rules
  config.ts    # content-side flags (ENABLE_PROPOSED_QUESTIONS), not env knobs
  visuals.ts + visuals-manifest.ts # which picture belongs to which lens/option (static/visuals/)
src/lib/ui/    # every screen lives HERE, not in routes/ — the +page.svelte files wire, they don't draw
  qr.ts        # the ONE QR drawer, shared by / and /admin/cards
  table/       # LandingScreen, FutureScreen, QuestionScreen, WildcardScreen, ReviewScreen,
               # DrawingScreen, ImagesScreen, DoneScreen, OptionList, Topbar
  projector/   # Lobby, Progress, Reveal, TableSequence, Finale, Ledger + aspect.ts/grouping.ts/tokens.ts
  admin/       # types.ts + fixtures.ts (the desk's screen is still routes/admin/+page.svelte)
src/lib/
  poll.svelte.ts       # ported from z-presence: 3-missed-reads staleness rule
  state/table.svelte.ts
scripts/        # gen-visuals.mjs / gen-contact-sheet.mjs — the lens+option pictures, run by hand
                # gen-event-pack.mjs — docs/event-pack.pdf: the 20 QR codes + the whole
                #   question set. REQUESTS every table URL against the live host first and
                #   outlines in red any that does not answer 200 (a QR code is the one
                #   artefact nobody checks until twenty people point phones at it):
                #   npx tsx scripts/gen-event-pack.mjs --host https://<domain>
migrations/     # 0001_narrative.sql, OPTIONAL — ensureTable() still creates it; the code is the source of truth
src/routes/
  t/[table]/           # table-range guard (+page.server.ts), answers.remote.ts (the phone's RPC
                       #   surface ONLY — its rules live in guards.ts: the table range, the
                       #   free-text ceiling, who may still save, the tick context, and the
                       #   one-per-isolate throttle; its spend path lives in queue.ts),
                       #   built +page.svelte (268 lines: questions, images, retry, draw again)
                       #   plus hero.ts, layers.ts, prompt-store.ts, narrative.ts (the done screen's
                       #   Workers AI paragraph: `AI` binding, append-only `narrative` table, AI_FAKE=1)
                       #   and img/[id]/+server.ts, which serves the render from R2
  projector/           # gallery.remote.ts, built +page.svelte (185 lines: beats, layouts, manual-override badge)
  admin/                # admin.remote.ts — ADMIN_TOKEN shared-secret gate on every command AND the poll itself (see admin.remote.ts's module note; this is not "no auth", it is a shared-secret gate, not a login), built +page.svelte (507 lines: the full desk), polls `adminRoom`
  admin/cards/          # the printable table cards (QR + code), reprintable per table
  admin/analytics/      # the room readout — analytics.remote.ts (one query, no commands, ticks and spends NOTHING)
  projector/img/[...key]/ # the projector's R2 read path
  health/               # GET /health?token=<ADMIN_TOKEN> — JSON, fail-closed, ticks NOTHING on purpose
  api/fal-webhook/      # +server.ts: token (fail-closed, constant-time) + image_id + request_id match, then the shared ticker inside waitUntil
  simulate/             # +server.ts: POST, drives N tables through the REAL remote commands (SIMULATE_ENABLED + ADMIN_TOKEN, both fail closed)
```

## Generation is a resumable state machine, not fire-and-forget

Per the game-flow design (`game-flow.md` §6/§8): `image.state` moves
`queued -> requested(fal_request_id) -> stored`, plus `failed`. (`done` — a
tile also exists — is defined but unreachable until the tile-resize upgrade
lands; see `r2.ts`'s ponytail note. `stored` is the de facto terminal
success state today.)

**Three tickers call the same `tickAndPersist()` (`ticker.ts`), never their
own bespoke logic:**
1. The phone's `tableStatus` poll (`routes/t/[table]/answers.remote.ts`) —
   ticks that table's pending rows.
2. The admin screen's `adminRoom` poll (`routes/admin/admin.remote.ts`) —
   ticks every pending row in the event.
3. The fal webhook (`routes/api/fal-webhook/+server.ts`) — ticks the one row
   its `image_id` query param names, with deps that resolve immediately from
   the payload instead of re-polling fal.

**Every state transition is a compare-and-swap.** The three tickers run on
independent clocks in independent isolates and each decides from a snapshot
its own caller read, so a bare `WHERE id = ?` let two of them both submit
one row to fal. `room.ts`'s `claimQueued` is the atomic `queued -> requested`
that decides which ticker may spend; `markRequested`/`markStored`/`markFailed`
all carry `AND state = <the state we decided from>` and report whether they
changed a row. A ticker that loses stops — losing is the normal case, not an
error. Cost of claiming before spending: a claimer that dies between the
claim and the submit leaves a `requested` row with a null request id, which
`tick()` fails after `STALE_CLAIM_MS` (2 min) so the table can draw again.

**`failed` is reachable, and visible.** `fal.ts` types `ERROR` alongside
fal's three live states and maps any unrecognised status to it, so a real
provider failure becomes a `failed` row rather than a row waiting for ever.
The phone leaves the Drawing screen once every render is terminal and offers
*Draw again*; the projector draws a failed tile differently from a tile that
has not arrived yet.

`requestWaitUntil` (`env.ts`) kicks the FIRST tick right after `finishTable`
queues a row — an optimisation, not the mechanism. If it's cut short (dead
phone, isolate recycle), any of the three tickers above resumes the same
row from whatever state it's in. `generate.ts`'s `tick()` no-ops on a
row that's already `stored`/`done`/`failed` — that single guard is what
makes dead-phone recovery, admin/phone polls racing each other, and a
duplicate webhook delivery all safe without three separate idempotency
mechanisms. `generate.test.ts` asserts the no-op directly ("ticking a
stored row is a no-op") and the requested/queued transitions.

## Nothing is updated in place

`answer` and `prompt` are append-only (`room.ts`): an edit is a new row
with `actor`/`source` and a `supersedes_id` pointing at the row it sits
above; `currentAnswers()` resolves "current" as the newest row per natural
key. `image` is append-only ACROSS regenerations (a regenerate inserts a
new row with `supersedes_id` set) but its `state`/`r2_key`/`fal_request_id`
columns are mutated in place WITHIN one generation attempt as `tick()`
advances it — that's the same attempt progressing, not a content edit, so
it doesn't need its own row per state.

Table/column names for `event_table`, `answer`, `prompt` and `image` are
taken from the game-flow design's `schema.draft.ts` where it already
defines them. Not adopted (out of scope for plumbing): `event`, `clip`,
`transcript`, `extraction`, `minutes`, `sequence`, `vote`, `admin_log` —
those belong to listen mode, the vote phase and admin logging, none built
yet. `gate.ts`'s two tables (`room_state`, `table_reopen`) are unchanged —
game-flow.md §5 explicitly says presence's gate semantics "carry over
unchanged", which is what the original scaffold already did.

## Rules carried from the architecture / game-flow docs

- **Throttle is per table, never per client IP.** One venue router is one IP.
- **`error()`/`redirect()` only work inside `query`, not `command`.**
  Commands (`saveAnswer`, `finishTable`, admin mutations) return a typed
  `{ ok: false, reason }` instead of throwing.
- **The URL is the credential, not an auth token.** `/t/[table]` has no
  cookie or signed token; every command re-validates `table` server-side
  against `1..TABLE_COUNT` with valibot.
- **"A generation already in flight is returned, not duplicated."** The
  check and the write are ONE statement — `insertQueuedImageIfIdle`'s
  `INSERT ... SELECT ... WHERE NOT EXISTS`. A read-then-write is per-isolate
  and two isolates both pass it, which is how a double-tap queued two full
  generation sets per table.
- **Spend is capped in three places, and the third is not in this repo.**
  `MAX_RENDERS_PER_TABLE` (default 12, never "no cap" on a bad value) and a
  60 s per-table regenerate cooldown, both derived from `image` rows rather
  than from an in-isolate timer — an isolate recycle, or simply a second
  isolate, hands a double-tap an empty timer and therefore no limit. The
  third is a hard cap on the fal dashboard; it is the only one that survives
  a bug in the other two.
- **The house half of the prompt rides in `system_prompt`.** The model
  documents the field (`fal.ts`'s schema note, checked 19 Sep) and this app
  ignored it until 21 Sep, so every house rule — camera, lighting, the
  no-text guard, the Avoid list — competed with the table's own answers for
  attention and for the character budget. `prompt.ts`'s `HOUSE_SYSTEM` now
  carries them, and `SYSTEM_PROMPT=off` is the revert.
  **It is ADDITIVE: the composed prompt still says all of it.** The failure
  mode `fal.ts` warns about is an unrecognised field accepted with a 200 and
  silently dropped; moving the rules out of the prompt in the same change
  that moved them in would strip the no-text guard and the Avoid list from
  every render at once with nothing to read as a failure. Delete the
  duplication only after a render proves the field lands.
  The field earned itself immediately: a 21 Sep render came back with
  laptops and 2020s task chairs in a frame whose Avoid list names both.
  The negative was not failing alone — the POSITIVE half had gone silent,
  because `ROOM_PARTICIPATES` is keyed by q7 and q7 was cut that morning,
  so nothing said what work looks like any more. `HOUSE_SYSTEM` now says it
  (bare timber and stone, surfaces lighting under their hands, the
  technology in the room rather than on the desk) and the same answers
  re-rendered without a laptop in frame. Same lesson as `SINGLE_FRAME`:
  a negative biases, it does not forbid.
- **Nothing reaches fal or R2 unbounded.** `fetch-image.ts` is the single
  image-fetch path for both the poll and the webhook: https-only allow-list
  of fal's hosts (the CDN is `*.fal.media`, a different domain from the
  `*.fal.ai` API), an 8 MB cap enforced by the read loop, and `image/*`
  required as both declared type and sniffed bytes. The composed prompt is
  capped at 1,500 characters and stripped of control characters, and the
  house negative is always appended. The cap was 1,200 and its comment
  assumed a composed base of "a few hundred characters"; a fully answered
  table measured 1,116-1,153, fifty characters from being silently cut —
  and what `sanitizeComposed` drops off the end is the Avoid list and the
  closing no-text guard.
- **Secrets fail closed.** `ADMIN_TOKEN`, `FAL_WEBHOOK_SECRET` and
  `SIMULATE_ENABLED` all reject when unset in production; `secretEquals`
  treats a missing expected value as "not equal" so a forgotten variable
  shuts a gate rather than opening it.
- **The projector follows the desk.** `room_beat` drives `/projector`;
  `?beat=`/`?table=` are a manual override with a visible badge.
- **Retention is an explicit parameter** on every fal submit call, never a
  library default.
- **`event_id` is a column on every table** from day one, so the archive
  step is a plain `wrangler d1 export`.

## Known deviations (recorded, not silent)

1. **No Cloudflare Image Resizing for the tile** — team override. `r2.ts`
   stores the full image only; `// ponytail:` names `@jsquash/resize` (or the
   Images binding) as the upgrade. This is also why `done` (tile exists) is
   unreachable — see the state-machine section above.
2. **Binding/resource names follow the team brief, not the architecture
   doc**: `DB`/`IMAGES` bindings, `z-interact-v4-db`/`z-interact-v4-images`
   default names in `wrangler.jsonc` — the architecture doc used
   `symposium_db`/`symposium-2026-09-*`, which would have put an event name
   in source. `event_id` is read from the `EVENT_ID` env var at runtime.
3. **fal webhook auth is a shared-secret query token**, not a verified fal
   signature — `// ponytail:` in `routes/api/fal-webhook/+server.ts` names
   ed25519 signature verification as the upgrade.
4. **Only four of `schema.draft.ts`'s 13 tables were adopted** (`event_table`,
   `answer`, `prompt`, `image`) — see "Nothing is updated in place" above for
   which ones and why.
5. **`event_table` has no `current_step` column.** Step is derived as
   `getCurrentAnswers(...).length` in `room.ts`'s `getTableState` — a
   TODO(content) once the real question set's resume semantics (skipped
   questions, listen-mode extractions) are wired.

## Rehearsal

`POST /simulate` drives N tables through the REAL remote-function commands —
the same gate, throttle, caps and prompt composition a phone hits. Seeded, so
the same `seed` replays the same room. Gated on `SIMULATE_ENABLED === 'true'`
AND `ADMIN_TOKEN`. It spends real money with a live key; `answersOnly: true`
stops before any render and `FAL_FAKE=1` runs the whole loop with no fal call.
The response's `disagreements` (tables whose reported submit disagrees with
what the room reads back) must be empty. Curl lines are in `NEW-EVENT.md`.

## What's still open for the content/plumbing workstreams

The earlier list here (placeholder prompts, stub screens, an unset fal model
id, an ungrouped gallery) is **done**. So is the list after it: the lens and
option images landed, and so did the reference-mode switch, the per-zone
retry, the bounded admin tick and the projector rework. Those are summarised
below under *recently closed* rather than deleted, because each one changed a
default that a reader of this file would otherwise have to infer from code.

What is actually still open:

- **The tile step.** `stored -> done` stays unreachable until a real resizer
  is wired — see `r2.ts`'s `// ponytail:` note. Nothing downstream is blocked
  by it; the projector and phones serve the full-size object.
- **fal webhook signature verification (ed25519).** The route's auth is still
  a shared-secret query token, now fail-closed and constant-time compared,
  with the callback's `request_id` matched against the row. Verifying fal's
  own signature is the upgrade.
- **Listen mode and the vote phase** — neither is started (schema.draft.ts's
  `clip`/`transcript`/`extraction`/`vote` tables are not created).
- **The zone set.** `ZONE_SET` defaults to **`hero`** — ONE main workspace
  image per table (`HERO_ZONES`, owner decision 20 Sep), composed by
  `hero.ts`'s `composeHeroPrompt`, not by `composeLayers`. `four` renders
  the four-zone set and `all` renders both. This file used to say the
  default was `book`; it is not, and the difference decides which composer
  a change to the prompt actually reaches.
- **`event_table` has no `current_step` column** — step is still derived from
  the answer count. The batched admin/projector read now gives a real count,
  so this only matters for resume semantics with skipped questions.

### Recently closed, with the defaults they set

- **A reset room is now USABLE, not merely empty (22 Sep).** `resetRoom` was
  a loop over `resetTable`, and a reset watermark is PER TABLE. The room lock
  and the projector beat are room-wide and neither moved — so the run the
  verb exists to enable (close the room, reset, hand the cards to a new set
  of tables) ended with twenty phones refused by `decideSubmit` and the wall
  still showing the finale of a room with nothing in it. The data half was
  right the whole time, which is why `reset-completeness.test.ts` passed
  through it. `resetRoom` now also unlocks and returns the beat to `lobby`;
  `clearRoom` now deletes `room_state`/`table_reopen`/`room_beat` as well, so
  a reused database stops remembering a lock and a reopen grant from an event
  that no longer has a row in it. `reset-room-usable.test.ts` pins both, and
  was confirmed to fail without the fix.
- **The favicon was the Svelte scaffold logo**, bundled through
  `$lib/assets` and therefore served under a content hash — so `/favicon.svg`
  itself 404'd and what the hash served was the orange Svelte mark, on twenty
  phones and on the projector. It is now `static/favicon.svg` at a stable
  path: nine tiles on `--ground-deep`, four lit in `--gold` — the front
  page's own shape, no wordmark, because the brand is a deploy value
  (`BRAND_LINE`) and this repo carries no company name.

- **The admin's room-wide verbs, and the photographs (22 Sep).** game-flow.md
  §5's "delete one table / clear the room" is done, as two verbs that are
  deliberately not alike. `resetRoom` is twenty watermarks — nothing deleted,
  every row still in D1 and in the Export — and is what a dry run wants.
  `clearRoom` is the **only DELETE in this codebase** and takes the event id
  typed back, not just the token: a shared secret in a URL has been in a
  browser history and possibly on a projector, so naming the event is what
  proves the facilitator knows which room they are erasing. `wrangler d1
  export` is the whole safety net. R2 objects are left orphaned rather than
  swept (keyed by image row id, so nothing can name them once the rows go).
  Both arm in place — the desk's own pattern, never a browser dialog.
  `/admin/photos` lists every stored render with a download link and a
  *Save all*; it ignores the reset watermark on purpose, because a watermark
  means "stop showing this", not "this never happened". No zip (ponytail).

- **"Change one thing" reaches the picture; a prompt edit never did.** The
  review screen's textarea is read-only because `composePromptFor` builds the
  hero prompt from the ANSWERS and ignores `ctx.composed` — an edit was
  accepted, stored and discarded (`prompt-edit.test.ts`). v1's
  edit-and-regenerate is therefore a **steer**, not a prompt edit: a 140-char
  clause composed exactly like the wildcard, last of the content and before
  the Avoid list, stored as an append-only answer row under `STEER.id`. An
  empty steer CLEARS the previous one. It is written BEFORE the redraw is
  queued, because `queueGeneration` composes from the answers as they stand.
  `steer.test.ts` asserts it is in the submitted string on both composers —
  reaching D1 alone would be the same bug renamed.

- **Four cities, not six; four recharge options, not six.** Both cuts were
  about NAMES colliding, not counts. `RETIRED_FUTURES` keeps the two
  withdrawn lenses whole because a lens carries `styleDna`/`worldOutside`/
  `lightLine`/`negativeFragment` — a row under a deleted key would compose
  with no world layer and nothing would say so; `futureByKey` and every name
  lookup read `ALL_FUTURES`, the phone and the validator read `FUTURES`.
  "The abundant city" became "The self-sufficient city" because its blurb had
  a disclaimer in it ("a city of plenty, NOT OF WILDERNESS") against being
  read as the garden city. A dropped OPTION, unlike a dropped lens, simply
  composes nothing — the same trade q8 took when the slider went.

- **A skipped lens no longer argues with itself.** "No future fits us — skip"
  is a button on screen one. `HOUSE_REGISTER` still said "moody rather than
  stark, pooled light, shadow held deliberately" — true before the light
  moved to the lens, and afterwards contradicted by the house exposure two
  sentences later and by the Avoid list's "gloom". It is plain bright
  daylight now, and `HOUSE_LIGHT` supplies the light clause that path had
  been composing without entirely.


- **The wildcard now reaches the picture (21 Sep end-to-end review).** It
  did not. `composeBase` — the FOUR-ZONE path — had carried it since the
  recipe was written; `hero.ts` never read it, and `ZONE_SET` defaults to
  `hero`, so the only prompt most rooms render was the one that dropped it.
  The phone's last screen promises "whatever it is, it goes into the drawing
  exactly as you write it", and the 21 Sep minutes make "What have we
  missed?" one of the five things asked. It reached D1, the review screen,
  the desk and the export — never the render. `layers.ts` now exports ONE
  `wildcardFragment` and both composers call it; it lands last of the
  content, immediately before the Avoid list, as `composeBase` places it.
  Both free-text fields on the hero path (the wildcard and q2's push reply)
  run through `sanitizeComposed` at the 140-char cap, because that path
  never passed the whole prompt through the sanitizer the base path uses.
  Re-measured after: **310–324 words, 1,898–1,973 chars** with both fields
  full — still under the 340 ceiling, with ~16 words of margin.
- **`ERA_YEAR['retro-1930s']` composed a broken sentence.** It was
  `'1930s-revival'`, so the opening line read "Design a workplace that is
  relevant in 1930s-revival". Not an edge case: `retro-1930s` is Neo Retro's
  `eraDefault`, so every table on that lens got it unless they nudged the
  chip. Now `'a reimagined 1930s'`; `hero.test.ts` guards every value on
  `ERA_SCALE` against reading as a slug.

- **The route review's four merges (21 Sep).** The three admin pages STAY
  three — `/admin` drives and ticks, `/admin/analytics` reads and
  deliberately ticks and spends nothing, `/admin/cards` prints — because
  folding the readout into the desk would put a read-only page behind a
  poll that spends. What merged was the plumbing under them:
  1. `server/admin-gate.ts` — one `ADMIN_TOKEN` rule. There were two: the
     desk and the readout each had a private `checkToken` treating an unset
     token as open in dev, while `/health` and `/simulate` used
     `secretEquals` directly, which closes everywhere. Both fail closed in
     production, so nothing was wrong — but the difference lived in four
     copies. `devOpen` is now an argument the caller passes, defaulting to
     the strict rule; `/simulate` deliberately does NOT pass it, because it
     spends with a live key.
  2. `server/r2.ts`'s `imageResponse` — one image serve for both routes.
  3. `ui/qr.ts` — one QR drawer for `/` and `/admin/cards`, which had
     already drifted to different quiet zones for codes scanned in one room.
  4. The readout counted spend with one `getRenderBudget` per table —
     twenty sequential D1 round trips. `getRenderStamps` reads them once.
     **Still open and measured, not fixed:** `exportRoomRows` is a
     per-table loop and a full room costs ~122 statements to read. It is
     shared with the desk's Export and the archive path, it is far inside
     the ~1,000-call ceiling, and the readout is refreshed by hand rather
     than polled — see `analytics-query-count.test.ts`'s note.

- **The front page is the room, not a leaflet** — generation 1's own shape.
  `/` is twenty square tiles, one per table, each showing that table's
  render once it is stored and its QR code until then, over a thin
  "n of 20 drawn" rule. The headline, the lede, the help line and the
  six-lens card section are gone; the grid is the instruction. It reads the
  projector's existing public `getProjectorRoom` (batched, unauthenticated,
  already the wall's own read) rather than adding an endpoint, and polls it
  at 5 s via `.refresh()` — a bare re-await returns the cached value and
  freezes the screen while reporting healthy. Tapping a tile still ENLARGES
  rather than navigates: `/t/[table]` has no login, so a mis-tap would
  become that table.

- **Cut to five questions, per the 21 Sep minutes.** `QUESTIONS` is now
  `q8, q5c, q6r, q2` — nature, deep work, recharge, materials — behind the
  lens and ahead of the wildcard. q3 (arrival), q4w (workstation, folded
  into q5c), q7 (technology), q10 (brilliant at one) and q11 (feel words)
  are gone. **A deleted question is not a deleted fragment:** a row from a
  table that answered under the eleven-question set still composes, because
  `layers.ts` reads by id and simply finds nothing for an id nobody answers
  today. `RETIRED_ZONES` (arrival, workstation, studio, plaza) exists for
  the same reason — `zoneByKey` has to resolve an image row drawn last week.
- **The light belongs to the lens now, not to a question.** q11's job moved
  to each future's `lightLine`, a bright register asserted in both
  `hero.test.ts` and `layers.test.ts` (must match `sun|daylight|bright|…`,
  must not match `night|dusk|gloom|…`). `DARK_FEEL_KEYS` survives as the
  knob that can opt a key back out; it is empty.
- **q8 is answered by a percentage slider**, minutes §4. `slider` on the
  question is one percentage per option in option order (10/30/55/80/100),
  and `OptionList` renders a range input over the same options — so the
  stored answer is still `keys: [oneKey]` and nothing downstream knows the
  difference. It commits on `pointerup`/`keyup` as well as `input`, because
  a range fires `input` only when its value CHANGES and the middle stop is
  where the untouched thumb already sits.
- **The opening screen is "Survival Adventure"**, its button says *Start
  here*, and Q1 asks *How do you imagine your future cognitive city?*
  (minutes §1; the cognitive-city wording is the 21 Sep note).

- **The exposure is said on every render, not just the hero.** `EXPOSURE`
  ("bright overall exposure, daylight filling the volume, open shadows") and
  `UNDEREXPOSED_NEGATIVE` moved from `hero.ts` to `prompt.ts`; `houseBase`
  takes a `bright` flag (default on) and `composeNegative` takes one too, so
  a four-zone render says it from both sides exactly as the hero does.
  `hero.ts` re-exports them and still holds the reasoning and the luminance
  measurements. Under the `hero` default this changes nothing about what the
  room renders today — it is the `four`/`all` sets that were left behind.
- **The room readout** (`/admin/analytics?token=…`). Answer distribution per
  question, lens split, typed replies, table-by-table progress, and spend
  against the cap — computed by the PURE `analytics.ts` from the rows
  `exportRoomRows` already returns, so the append-only "latest wins" rule and
  the reset watermark are honoured rather than re-implemented in SQL. Spend
  comes from `getRenderBudget`, the same counter `limits.ts` caps against.
  The desk now links to it, and to `/admin/cards`, which was equally
  unreachable.

- **The retry UI hooks are wired, both ends.** The phone's failed tile calls
  `retryZone` (`onretry` in `routes/t/[table]/+page.svelte`) and the desk's
  per-zone Redraw button on the images cell calls `regenerateTable`'s
  optional `zone` (`routes/admin/+page.svelte`, `failedZones()`). Verified
  2026-09-21 by reading both files — this used to say the controls were not
  in this branch; they are.
- **`REFERENCE_MODE`** decides how much the chosen lens picture decides the
  render: `none` (default) text-to-image everywhere, `lens` first zone only,
  `chain` every zone. Default is `none` because the edit endpoint reproduces
  a reference's framing rather than recomposing, which made all four zones of
  a table one picture with small edits. An unrecognised value falls back to
  `none`. See `server/reference.ts`.
- **The admin read never awaits a tick.** It answers from D1 and advances a
  bounded slice in `waitUntil` (`ADMIN_TICK_BUDGET`, default 8, oldest
  first). It used to walk its slice inside the request and took 36 s with a
  room full of pending rows.
- **A failed zone can be retried on its own**, for one render rather than
  four, with the prompt read back verbatim from the `image_detail` sidecar.
- **The projector picks its layout from the frame.** Above 2.5:1 it lays out
  as three 16:9 panels; `?aspect=wide` and `?aspect=16x9` force either.
  `?surface=ledger` turns a screen into the room ledger for the venue's two
  televisions. No beat prints a future's name — the lens is hidden analysis,
  and it survives on the wall as position and colour only (`grouping.ts`).
- **R2 objects are keyed and labelled from sniffed bytes**, both written and
  served. The `.webp`-for-everything assumption is gone from both paths —
  and since 21 Sep that is true of BOTH serve routes, not just the phone's:
  `/projector/img/[...key]` handed back the bucket's stored label untouched,
  so a pre-fix object labelled `image/webp` rendered on a phone and not on
  the wall. `r2.ts`'s `imageResponse` is the one implementation now.
