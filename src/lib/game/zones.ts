/**
 * FUNCTIONAL ZONES — TODO(content), owned by the zones-video workstream.
 *
 * One image is rendered per table per zone (ADR-036 §3). Fixed interface:
 * `ZONES` is the list `finishTable` iterates in `fal.ts`/`prompt.ts`, and
 * each `key` is also the R2/D1 key component (`r2.ts`'s `imageKey`).
 */
import type { ZoneRef } from '$lib/server/prompt';

// TODO(content): replace with the real functional zones (candidates per
// ADR-036 §4.2: the book's four functions, or zones derived from the
// questions — final list from the zones study).
export const ZONES: ZoneRef[] = [{ key: 'todo-zone-1', renderSuffix: 'TODO(content): render suffix' }];
