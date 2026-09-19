# New event checklist

Run through this once per event before the doors open. `event_id` is a column
on every table, so the archive step at the end needs no bespoke loader.

- [ ] New D1: `<event>-db` (not a shared/rename) — `wrangler d1 create <event>-db`,
      then paste the returned `database_id` into `wrangler.jsonc`
- [ ] New Pages project: own name, own custom domain
- [ ] New R2 bucket: `<event>-images` — paste the bucket name into `wrangler.jsonc`
- [ ] `FAL_KEY` set via `wrangler pages secret put FAL_KEY --project-name <project>`,
      confirmed live/billable
- [ ] `FAL_WEBHOOK_SECRET` set the same way; used as the fal webhook URL's
      shared-secret query param (see `src/lib/server/fal.ts`)
- [ ] `event_id` convention: `<app>-<YYYY-MM>` — set once, used on every row
- [ ] `nodejs_als` compatibility flag present (`getRequestEvent()` is used
      throughout)
- [ ] `SIMULATE_ENABLED` unset (or `false`) in production; set only during
      rehearsal
- [ ] Confirm table count / range (`TABLE_COUNT` in `src/lib/game/questions.ts`)
      matches the venue's printed QR tent cards
- [ ] After the event: export D1, copy R2, index, retire per the data
      lifecycle SOP
