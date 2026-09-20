/**
 * VISUALS — maps every future ("lens") and every fixed-choice question option
 * to a generated still, produced by `scripts/gen-visuals.mjs` into
 * `static/visuals/`. Read-only data: this module never calls fal itself.
 *
 * Coverage is deliberately partial for options: `open` options (answered by
 * typing, e.g. Q3's "both, and in what order") and the free-text wildcard
 * question have no fixed visual to render, so they carry no entry here.
 * `hasOptionImage` is the one call site that needs to know that up front,
 * rather than every consumer probing `OPTION_IMAGE` for `undefined`.
 */
import { FUTURES, type Future } from './futures';
import { QUESTIONS } from './questions';

export type FutureKey = Future['key'];

function optionImageKey(questionId: string, optionId: string): string {
	return `${questionId}:${optionId}`;
}

export const LENS_IMAGE: Record<Future['key'], string> = Object.fromEntries(
	FUTURES.map((f) => [f.key, `/visuals/lens/${f.key}.jpg`])
) as Record<Future['key'], string>;

/**
 * What is actually on disk. Vite's glob (not `node:fs`, so this module stays
 * importable on the client and in the Worker) — a picture the generator has
 * not produced yet is simply absent, and `OptionList` falls back to its
 * text row rather than an `<img>` with a 404 source. V4 shipped with 36 of
 * its 53 option pictures pending on a fal balance; this is what makes that
 * a plain list rather than a wall of blank tiles.
 */
const ON_DISK: ReadonlySet<string> = new Set(
	Object.keys(import.meta.glob('/static/visuals/opt/*.jpg')).map((p) => p.replace(/^\/static/, ''))
);

/** Every non-open option's picture path, for the ones that exist on disk. */
export const OPTION_IMAGE: Record<string, string> = Object.fromEntries(
	QUESTIONS.flatMap((q) =>
		q.options
			.filter((o) => !o.open)
			.map((o) => [optionImageKey(q.id, o.key), `/visuals/opt/${q.id}-${o.key}.jpg`] as const)
			.filter(([, path]) => ON_DISK.has(path))
	)
);

/** Whether this question/option pair has a generated image on disk (false for
 *  `open` options, the wildcard, and any option whose picture is still pending). */
export function hasOptionImage(questionId: string, optionId: string): boolean {
	return optionImageKey(questionId, optionId) in OPTION_IMAGE;
}

/**
 * The lens picture for a future, or null when that future has none. Used by
 * `server/reference.ts` as the style anchor for a table's renders: a future
 * with no picture falls back to text-to-image, which is how every render
 * worked before the reference path existed. Paths are root-relative and are
 * made absolute at submit time, because fal fetches them from the open
 * internet.
 */
export function lensImagePath(futureKey: string | null | undefined): string | null {
	if (!futureKey) return null;
	return (LENS_IMAGE as Partial<Record<string, string>>)[futureKey] ?? null;
}
