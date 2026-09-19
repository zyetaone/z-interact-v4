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

- [ ] `FAL_KEY` set and confirmed live/billable
- [ ] `FAL_WEBHOOK_SECRET` set — used as the webhook URL's shared-secret query param
- [ ] `ADMIN_TOKEN` set — `/admin?token=...` is the only way in
- [ ] `EVENT_ID` set to `<app>-<YYYY-MM>`
- [ ] `MAX_RENDERS_PER_TABLE` reviewed against the budget (see below)
- [ ] `SIMULATE_ENABLED` unset (or anything but `true`) **before the doors open**

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

Needs `SIMULATE_ENABLED=true` and a matching `ADMIN_TOKEN`; both fail closed.
The response carries `submitted`, `rendersQueued`, every refusal, and
`disagreements` — tables whose reported submit disagrees with what the room
reads back. **`disagreements` must be empty.** Same `seed` replays the same
room, so a fix can be confirmed rather than hoped for.

- [ ] Rehearsal run, `disagreements` empty, refusals understood
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
