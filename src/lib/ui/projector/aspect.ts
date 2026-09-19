/**
 * WHICH WALL IS THIS?
 *
 * The venue's LED wall is roughly three 16:9 panels side by side (~5.3:1).
 * Two small wall TVs run the same page at 16:9. One layout cannot serve
 * both: a 16:9 composition on the LED wall leaves the beat in a sliver at
 * the left edge, which is exactly what the first 5760x1080 capture showed.
 *
 * So the page picks a layout from the frame it finds itself in, and the
 * operator can override it from the URL when the wall reports something
 * strange (a scaler that claims 1920x1080 for a 5760 surface is a normal
 * kind of AV problem, and the fix has to be typeable).
 *
 * The override picks the LAYOUT, never the geometry: forcing `wide` on a
 * laptop previews the three-panel composition squeezed into 16:9 rather
 * than letterboxing the page, so a mistyped override can never shrink the
 * real wall to a strip on the night.
 */

/** Above this width-to-height ratio, the three-panel layout. ~2.5:1 sits between 16:9 (1.78) and the wall (5.3). */
export const WIDE_MIN_RATIO = 2.5;

export type AspectOverride = 'wide' | '16x9' | null;

/** `?aspect=wide` / `?aspect=16x9`. Anything else is not an override. */
export function parseAspect(raw: string | null | undefined): AspectOverride {
	return raw === 'wide' || raw === '16x9' ? raw : null;
}

/**
 * @param override what the URL asked for, if anything
 * @param ratio viewport width / height; 0 or NaN before the frame is measured
 */
export function isWideWall(override: AspectOverride, ratio: number): boolean {
	if (override) return override === 'wide';
	return Number.isFinite(ratio) && ratio >= WIDE_MIN_RATIO;
}

/**
 * How many panels the wide layout splits into: one per 16:9 the frame can
 * hold, clamped to 3. The venue wall is three; a hypothetical two-panel or
 * four-panel surface should not be a code change.
 */
export function panelCount(ratio: number): number {
	if (!Number.isFinite(ratio) || ratio < WIDE_MIN_RATIO) return 1;
	return Math.min(3, Math.max(2, Math.round(ratio / (16 / 9))));
}
