# Question-to-image fidelity — end-to-end run (2026-09-19)

Run by the e2e agent against a local vite dev server (adapter-cloudflare platform proxy: local D1 + R2),
event `proto-2026-09`, real fal calls to `fal-ai/nano-banana-2` (no `FAL_FAKE`), Playwright + chromium at
390×844 driving the real `/t/[table]` phone UI. Code under test: 260c369 (the run started on 590a614 and the
worktree moved under it; two bugs found early were fixed upstream mid-run — see bugs 1 and 2).

## Verdict

Content and prompt plumbing work as designed: layer order, zone suffixes, future/era isolation and style lock
all check out against the real UI and real answers. Generation is not yet reliable: 4 of 12 zone requests
failed with an opaque 422, and a table whose whole render fails is stranded on the phone. The negative prompt
is composed and stored but never sent to fal; the exact per-zone prompt is never persisted. When generation
succeeds, quality is high: strong style lock, many individual answers visibly legible, no personas, no text.

## Zone-by-zone fidelity

**Table 1 — Neo-Seoul / Cyberpunk** (3 of 4 zones rendered; library failed). `zone-studio`: night megacity
skyline, rain-slick glass, magenta/cyan signage (mood); illuminated winding floor path (Q4); two wheeled
service robots (Q10); wall-sized data screens (Q7/Q9); deep pooled light (Q2). `zone-plaza` / `zone-garden`
share the skyline, mood and light-path floor; greenery only as balcony planters through glass (Q8 sparse
inside / abundant outside). Weak or absent: "furniture that moves itself" / "rooms that change size" (Q6)
and "null zone with no signal" (Q5) have no visual referent in a still. Nothing contradicts the prompt. The
wildcard ("a glass bridge between two towers") is literally present as sky-bridges.

**Table 2 — Garden City** (4 of 4). Consistent timber / rammed-earth pavilion in forest at golden and blue
hour across all zones. Glass dome in garden (Q5), full rainforest behind glazing (Q8), a stream through the
courtyard (the wildcard), a person at reception (Q3 human welcome), raw materials (Q2). Weak: "meeting in
gardens / on stairs / walking" (Q6) not staged distinctly per zone. Q9/Q10 open-text fields were blank.
Nothing contradicts the prompt. Note: the model produced a presentation *board* (hero view + ten small
panels) rather than one scene — the composed prompt reads like a brief. Fix: house base demands one
continuous scene; negative forbids collage/grid/panels; programme layer capped per zone.

**Table 3 — Retrofuturism** (0 of 4). Every zone failed with the identical fal 422, immediately after table
2 succeeded 4/4 on the same model. At prompt level (reconstructed offline from the pure composer), tables 1
and 3 are byte-identical in materials/programme/feel/wildcard and differ only in mood and negative list —
future isolation is exactly as designed.

Table 1 vs table 2: unambiguously different worlds on every axis. Style lock within a table: yes for both
tables with images — each table's zones read as one place, because every zone prompt carries the whole
table-level base plus a small zone suffix.

## Prompt composition

- Layer order confirmed: mood → materials & light → programme → feel → wildcard.
- No fragment missing or duplicated within the base. Every zone's final string duplicates by design: the base
  already holds every Q3–Q10 fragment, then the zone suffix repeats a subset (library repeats Q5/Q7, plaza
  Q3/Q4/Q6, garden Q5/Q8). Q9/Q10 appear once, only in the base.
- NO_TEXT guard sent first and last, confirmed.
- **Negative prompt never sent to fal.** `submitZoneImage`'s body is `{prompt, sync_mode, retention,
  metadata}`; `layers.negative` goes only into the prompt table's `negative` column.

## Bugs and gaps

1. **Future screen had no way forward** (screen 3): `saveFuture`/`saveEra` called with `advance=false` and
   the only forward control rendered inside `{#if !chosen}`. Evidence
   `table-N/03-future-stuck-no-continue-button.png`. Fixed upstream mid-run (637735a, 260c369).
2. **Model id was the placeholder string** in `ticker.ts` / `answers.remote.ts`. Fixed upstream (3a62404,
   `FAL_MODEL`). Residual: `admin.remote.ts` keeps its own placeholder const, written into `image.model` on
   admin regenerates.
3. **4 of 12 zone requests failed with `fal result failed: 422`.** `fetchResult`/`pollStatus` capture only
   the HTTP status, never the body, so the stored error cannot distinguish rate-limiting from a malformed
   request. No retry: `tickAndPersist` marks a row failed on the first exception.
4. **A table whose entire render fails has no way forward.** `DrawingScreen` only advances when some image
   has a url. Evidence `table-3/18-images-or-timeout.png`. Only an admin regenerate recovers it.
5. **The per-zone prompt is never persisted.** `insertQueuedImage` receives `prompt`; the `image` table has
   no column and the INSERT ignores it. `zone-prompts.txt` was reconstructed offline from the pure composer.
6. **The phone's 2 s poll went stale** on a long-lived page (table 2: a full minute after all four images were
   stored; a fresh navigation resumed correctly). Probably the poll-cache change in 260c369 did not reach
   `DrawingScreen`'s own poll instance.
7. **R2 objects are keyed and labelled `.webp`** regardless of bytes; every image in this run was PNG (magic
   bytes). The serving route sniffs bytes so browsers are fine; keys and metadata are wrong.
8. **The admin ticker is unbounded**: it ticks every non-terminal row event-wide on every load; an admin
   regenerate on table 3 hung for minutes (possibly worsened by concurrent test traffic).

## Assumptions

Q1 left at each future's chip default. Table 2's open-text Q9/Q10 and the diamond push replies left blank.
Table 3 reused table 1's Q2–Q11 and wildcard verbatim. Default "book" zone set.

## Timing (wide error bars — the image table has no completion timestamp)

Table 1 submitted ~15:42, 3/4 stored by ~15:49 (one zone never terminated). Table 2 submitted ~15:49, 4/4
stored by ~15:53 (~4 min, clean). Table 3 submitted ~15:55, all four failed within a minute.

## Artefacts

`docs/fidelity/table-{1,2,3}/`: every screen, `prompt.txt` (table-level composed prompt), `zone-prompts.txt`
(reconstructed per-zone strings), `zone-*.jpg` (downscaled from the stored PNGs), `timing.json`.
`tests/e2e/`: the Playwright specs and page object used for the run.
