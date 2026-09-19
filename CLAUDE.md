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
| `@cloudflare/workers-types` | pinned to latest at scaffold time |

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
npm run test          # vitest --run
npm run build         # vite build -> .svelte-kit/cloudflare
```

Deploy (manual, not wired to CI yet):
```bash
wrangler pages deploy .svelte-kit/cloudflare --project-name <project>
wrangler pages secret put FAL_KEY --project-name <project>
wrangler pages secret put FAL_WEBHOOK_SECRET --project-name <project>
wrangler pages secret put ADMIN_TOKEN --project-name <project>
```
`NEW-EVENT.md` has the full variable table and what each one's absence does.
All three secrets above FAIL CLOSED when unset in production.
`wrangler secret put` (no `pages`) does **not** reach a Pages project — it
leaves the key unset in production, which then looks exactly like a dead key.

## Folder map

```
src/lib/server/
  env.ts       # ONLY file importing $app/server. requestEnv()/envOf()/eventId()/requestOrigin()/requestWaitUntil()
  d1.ts        # ensureTable/isTransientD1Error — takes D1Database as an argument, no $app/server
  gate.ts      # decideSubmit (pure) + D1-backed room lock / table-reopen wrappers
  room.ts      # event_table/answer/prompt/image DDL + CRUD (append-only where noted, see below)
  generate.ts  # tick() — the resumable generation state machine, pure, deps-injected
  ticker.ts    # tickAndPersist()/realGenerateDeps()/buildWebhookUrl() — the one ticker impl, shared by all three callers
  r2.ts        # image key scheme (keyed by image row id) + put/get (see its ponytail note re: tiles)
  fal.ts       # queue.fal.run submit/status/result over raw fetch
  prompt.ts    # composeLayers — pure, content-free layer ordering
  throttle.ts  # createThrottle() — an in-isolate optimisation, NOT a guard (see its note)
  limits.ts    # pure spend rules: per-table render cap + regenerate cooldown
  fetch-image.ts # the ONE place image bytes come off the internet: host allow-list, byte cap, type sniff
  secret.ts    # constant-time secret compare, hand-written (no Cloudflare-only API)
  simulate.ts  # the PURE rehearsal plan (seeded); the route drives it through the real commands
src/lib/game/
  questions.ts # the 11 questions + wildcard (content landed — futures-palette/game-flow workstreams)
  futures.ts   # the seven named futures + era fields
  zones.ts     # both candidate zone sets behind ZONE_SETS, defaulting to `book`
  era.ts       # the era scale + allowedEras/nudge rules
src/lib/
  poll.svelte.ts       # ported from z-presence: 3-missed-reads staleness rule
  state/table.svelte.ts
src/routes/
  t/[table]/           # table-range guard (+page.server.ts), answers.remote.ts, stub +page.svelte
  projector/           # gallery.remote.ts, stub +page.svelte
  admin/                # admin.remote.ts (no auth yet — see its ponytail note), stub +page.svelte, polls roomLock
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
2. The admin screen's `roomLock` poll (`routes/admin/admin.remote.ts`) —
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
- **Nothing reaches fal or R2 unbounded.** `fetch-image.ts` is the single
  image-fetch path for both the poll and the webhook: https-only allow-list
  of fal's hosts (the CDN is `*.fal.media`, a different domain from the
  `*.fal.ai` API), an 8 MB cap enforced by the read loop, and `image/*`
  required as both declared type and sniffed bytes. The composed prompt is
  capped at 1,200 characters and stripped of control characters, and the
  house negative is always appended.
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
id, an ungrouped gallery) is **done** — the tap flow, the admin desk, the
three tickers' real composed prompts, the grouped Reveal and the model id all
landed. What is actually still open:

- **Lens and option images** — `src/lib/game/visuals.ts` and
  `static/visuals/**` land on a separate branch; `FutureScreen`/`OptionList`
  are deliberately untouched here.
- **The tile step.** `stored -> done` stays unreachable until a real resizer
  is wired — see `r2.ts`'s `// ponytail:` note. Nothing downstream is blocked
  by it; the projector and phones serve the full-size object.
- **fal webhook signature verification (ed25519).** The route's auth is still
  a shared-secret query token, now fail-closed and constant-time compared,
  with the callback's `request_id` matched against the row. Verifying fal's
  own signature is the upgrade.
- **Admin's destructive verbs.** game-flow.md §5 lists "delete one table /
  clear the room"; `resetTable` (a watermark, never a delete) and `exportRoom`
  exist, the hard-reset paths do not.
- **Listen mode and the vote phase** — neither is started (schema.draft.ts's
  `clip`/`transcript`/`extraction`/`vote` tables are not created).
- **The zone set.** `ZONES` defaults to `book`; `questions` is implemented
  behind `ZONE_SETS` and the lead's call is a one-line change.
- **`event_table` has no `current_step` column** — step is still derived from
  the answer count. The batched admin/projector read now gives a real count,
  so this only matters for resume semantics with skipped questions.
