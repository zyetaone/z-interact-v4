/**
 * LENS PICTURES — the style anchor for a table's renders.
 *
 * The owner's instruction: the workspace renders must match the tone and
 * mood of the lens picture the table chose. The mechanism is here and in
 * `server/reference.ts`; the pictures themselves are not.
 *
 * **This map is deliberately EMPTY.** The `feat/visuals` branch fills it and
 * lands the files under `static/visuals/lens/`. Nothing in this repo
 * generates them. An empty map is not a broken state: a future with no lens
 * picture falls back to text-to-image, which is exactly how every render
 * worked before this path existed, so the whole thing degrades to the
 * previous behaviour rather than failing.
 *
 * Values are ROOT-RELATIVE paths (`/visuals/lens/<key>.jpg`). They are made
 * absolute at submit time against the request's own origin, because fal
 * fetches them from the open internet — a relative path would be fetched by
 * nobody. That also means the lens path only works against a deployment fal
 * can reach; on a laptop the references are unreachable and `FAL_FAKE=1` is
 * how the loop is exercised.
 */
import { FUTURES, type Future } from './futures';

export type FutureKey = Future['key'];

/** Root-relative path per future. Filled by the visuals branch — see the module note. */
export const LENS_IMAGE: Partial<Record<FutureKey, string>> = {};

/** The lens picture for a future, or null when that future has none yet. */
export function lensImagePath(futureKey: string | null | undefined): string | null {
	if (!futureKey) return null;
	return LENS_IMAGE[futureKey] ?? null;
}

// --- Shape guard -------------------------------------------------------------
// A typo'd key would silently mean "this future has no lens picture", which
// reads on the night as one future's tables quietly rendering in the wrong
// register. Fail at import instead.
for (const key of Object.keys(LENS_IMAGE)) {
	if (!FUTURES.some((f) => f.key === key)) {
		throw new Error(`LENS_IMAGE has a key no future uses: ${key}`);
	}
}
