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
  env.ts       # ONLY file importing $app/server. Env type, requestEnv()/envOf(), eventId()
  d1.ts        # ensureTable/isTransientD1Error — takes D1Database as an argument, no $app/server
  gate.ts      # decideSubmit (pure) + D1-backed room lock / table-reopen wrappers
  room.ts      # events/tables/answers/revisions/prompts/images DDL + CRUD
  r2.ts        # image key scheme + put/get (see r2.ts's ponytail note re: tiles)
  fal.ts       # queue.fal.run submit/status/result over raw fetch
  prompt.ts    # composeLayers — pure, content-free layer ordering
  throttle.ts  # createThrottle() — keyed by table number, never by IP
  webhook.ts   # handleFalWebhook — pure, deps injected, tested with fakes
src/lib/game/
  questions.ts # TODO(content): the 11 questions + wildcard
  futures.ts   # TODO(content): the named future/mood palette
  zones.ts     # TODO(content): the functional zones (one image per zone)
src/lib/
  poll.svelte.ts       # ported from z-presence: 3-missed-reads staleness rule
  state/table.svelte.ts
src/routes/
  t/[table]/           # table-range guard (+page.server.ts), answers.remote.ts, stub +page.svelte
  projector/           # gallery.remote.ts, stub +page.svelte
  admin/                # admin.remote.ts (no auth yet — see its ponytail note), stub +page.svelte
  api/fal-webhook/      # +server.ts: validates body + token, calls webhook.ts inside waitUntil
```

## Rules carried from the architecture doc

- **Throttle is per table, never per client IP.** One venue router is one IP.
- **`error()`/`redirect()` only work inside `query`, not `command`.**
  Commands (`saveAnswer`, `finishTable`, admin mutations) return a typed
  `{ ok: false, reason }` instead of throwing.
- **The URL is the credential, not an auth token.** `/t/[table]` has no
  cookie or signed token; every command re-validates `table` server-side
  against `1..TABLE_COUNT` with valibot.
- **Idempotency on `images`**: `UNIQUE(request_id)` — a retried `finishTable`
  or a duplicate webhook delivery never causes a second fal charge or a
  second R2 write.
- **Retention is an explicit parameter** on every fal submit call, never a
  library default.
- **`event_id` is a column on every table** from day one — see `room.ts`'s
  DDL — so the archive step is a plain `wrangler d1 export`.

## Known deviations from the architecture doc (recorded, not silent)

1. **No Cloudflare Image Resizing for the tile** — team override. `r2.ts`
   stores the full image only; `// ponytail:` names `@jsquash/resize` (or the
   Images binding) as the upgrade for the second stored size.
2. **Gate is two D1 tables (`room_state`, `table_reopen`), not one `gate`
   table** — ported from z-presence's proven shape; the brief's schema list
   named a single `gate` table. Functionally equivalent; a content agent
   adding columns should treat these two as the gate concern.
3. **Binding/resource names follow the team brief, not the architecture
   doc**: `DB`/`IMAGES` bindings, `z-interact-v4-db`/`z-interact-v4-images`
   default names in `wrangler.jsonc` — the doc used `symposium_db`/
   `symposium-2026-09-*`, which would have put an event name in source.
   `event_id` is read from the `EVENT_ID` env var at runtime instead of a
   hardcoded string.
4. **fal webhook auth is a shared-secret query token**, not a verified fal
   signature — `// ponytail:` in `routes/api/fal-webhook/+server.ts` names
   ed25519 signature verification as the upgrade once confirmed against
   fal's current docs.
5. **A fifth test file, `webhook.test.ts`**, was added beyond the brief's
   four named rules to cover fal-webhook idempotency directly (the brief's
   own text asked for this rule under "webhook idempotency" — it just isn't
   one of `prompt`/`gate`/`throttle`/`room`). `room.test.ts` covers the
   answer round-trip via `rowToAnswers`, matching the brief's fourth rule.

## What the content workstreams drop in

- `src/lib/game/questions.ts` — replace `QUESTIONS`/`WILDCARD`, keep `id`s
  stable once tables start answering.
- `src/lib/game/futures.ts` — replace `FUTURES`.
- `src/lib/game/zones.ts` — replace `ZONES`.
- `src/lib/server/prompt.ts` — wire the real `LayerInputs` mapping from
  answers (currently stubbed in `answers.remote.ts`'s `finishTable`).
- `src/routes/t/[table]/+page.svelte` — replace the stub with the 13-screen
  flow (tone, Q1-11, wildcard).
- `src/routes/projector/+page.svelte` and `gallery.remote.ts`'s `roomImages`
  — gallery grouped by future, per-table zone sequence.
- `src/routes/admin/+page.svelte` and `admin.remote.ts`'s `seedRoom`/
  `deleteTable`/`resetRoom`/`exportRoom` — currently `not implemented` stubs.
