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
```
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
  throttle.ts  # createThrottle() — keyed by table number, never by IP
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
  api/fal-webhook/      # +server.ts: validates body + token + image_id, calls the shared ticker inside waitUntil
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
- **"A generation already in flight is returned, not duplicated."**
  `finishTable` checks for a current non-failed `image` row per zone before
  inserting a new one.
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

## What's still open for the content/plumbing workstreams

- `answers.remote.ts`'s `finishTable` composes `LayerInputs` from placeholder
  strings, not the real future/answer mapping (`LAYER_OF_QUESTION` now
  exists in the game-flow design and should replace the stub).
- `tableStatus`/`roomLock`'s tickers pass a placeholder prompt string rather
  than reading `prompt.composed` by the image row's `promptId` — wiring that
  read is the last piece connecting `room.ts`'s `insertPrompt` output to the
  ticker.
- `src/routes/t/[table]/+page.svelte` — replace the stub with the 18-screen
  tap flow (game-flow.md §1).
- `src/routes/projector/+page.svelte` and `gallery.remote.ts`'s `roomImages`
  — gallery grouped by future, per-table zone sequence.
- `src/routes/admin/+page.svelte` and `admin.remote.ts`'s `seedRoom`/
  `deleteTable`/`resetRoom`/`exportRoom` — currently `not implemented` stubs.
- fal model id is `'TODO(content): fal model id'` in `ticker.ts` — set once
  chosen.
