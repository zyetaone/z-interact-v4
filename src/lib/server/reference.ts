/**
 * THE STYLE ANCHOR, and the one dependency in the generation graph.
 *
 * Every zone render is anchored to the lens picture the table chose, so the
 * four images read as one building in one register rather than four
 * unrelated rooms. Zones after the first are ALSO anchored to the first
 * zone's own render, which is what carries the table's specific materials,
 * light and palette across the set — the lens picture alone would keep the
 * mood but not the building.
 *
 * That makes zones 2-4 depend on zone 1, and this module is the whole of
 * that dependency. It is PURE: the ticker reads the anchor's state from D1
 * and hands it in, so `reference.test.ts` drives every branch with no
 * database and no clock.
 *
 * All four rows are still QUEUED at once. The dependency is enforced at
 * TICK time, not at insert time — a row nobody may submit yet simply is not
 * claimed, and the next poll asks again. That reuses the resumable state
 * machine instead of adding a second scheduler, and it means a phone that
 * dies while zone 1 is rendering still gets its other three zones.
 */
import { ZONES } from '$lib/game/zones';

/**
 * HOW MUCH THE LENS PICTURE IS ALLOWED TO DECIDE.
 *
 * Measured on table 2 (Solarpunk) with `chain`: all four zones rendered in
 * 20 s and the mood matched the lens picture exactly — but library, studio
 * and plaza came back as the SAME COMPOSITION as the lens picture with small
 * edits, and garden was a light re-dress of it. That is what the edit
 * endpoint does: it reproduces the reference's framing, it does not
 * recompose into a different room. Zone 1 became the lens, and zones 2-4
 * became zone 1.
 *
 * The earlier text-only run gave one-place coherence with genuinely
 * different rooms, which is the result the event wants, so that is the
 * default again. The reference path is kept, because "the mood must match
 * the lens" is a real requirement and `lens` is the middle setting that
 * buys it for one zone without flattening the other three.
 *
 *   none  — text-to-image everywhere. Four fresh rooms; coherence comes from
 *           the shared base prompt and the per-zone viewpoints. DEFAULT.
 *   lens  — zone 1 only is anchored to the lens picture; zones 2-4 are
 *           text-only and do NOT wait for it. One zone locked to the lens
 *           register, three free.
 *   chain — zone 1 anchored to the lens, zones 2-4 anchored to zone 1.
 *           Strongest continuity, and the composition lock described above.
 *
 * Confirmed 20 Sep on a one-table loop: the lens card through the edit
 * endpoint with the instruction "use the reference only for palette,
 * materials and signage style; compose a completely new scene" DID
 * recompose into a different room. That is a viable instruction for
 * `lens` mode if the lead switches it on; the default stays `none`.
 */
export type ReferenceMode = 'none' | 'lens' | 'chain';

export const DEFAULT_REFERENCE_MODE: ReferenceMode = 'none';

/** Reads `REFERENCE_MODE`, falling back to `none` on anything unrecognised — a typo must not silently turn the composition lock back on. */
export function referenceModeFrom(raw: string | undefined): ReferenceMode {
	const modes: ReferenceMode[] = ['none', 'lens', 'chain'];
	return modes.find((m) => m === raw) ?? DEFAULT_REFERENCE_MODE;
}

/**
 * The zone every other zone is anchored to — the first in `ZONES`, so
 * changing the zone set moves the anchor with it rather than leaving a
 * hardcoded key pointing at a zone that no longer exists.
 */
export const ANCHOR_ZONE = ZONES[0].key;

/**
 * How long zones 2-4 wait for zone 1 before going ahead with the lens
 * picture alone. A stuck or failed anchor must not take the other three
 * zones down with it: a table with three good renders in a slightly looser
 * register is a far better outcome on the night than a table with one.
 */
export const ANCHOR_WAIT_MS = 90_000;

export interface AnchorState {
	/** Absolute URL of the anchor zone's stored render, or null while it has not landed. */
	anchorUrl: string | null;
	/** True once the anchor can never land — failed, or superseded and gone. */
	anchorSettled: boolean;
	/** When THIS row was queued; the wait is measured from here. */
	queuedAt: number;
	now: number;
	/** Absolute URL of the chosen future's lens picture, or null when that future has none. */
	lensUrl: string | null;
}

export type ReferenceDecision =
	| { ready: true; referenceUrls: string[]; reason: string }
	| { ready: false; reason: string };

/**
 * Whether this row may be submitted now, and with which references.
 *
 * Order matters: the anchor zone itself never waits (it IS what everything
 * waits for), a landed anchor is always used, and the timeout is the last
 * resort rather than the first.
 */
export function decideReferences(zoneKey: string, state: AnchorState, mode: ReferenceMode): ReferenceDecision {
	const lens = state.lensUrl ? [state.lensUrl] : [];

	// Text-to-image everywhere. Nothing waits for anything, which is also why
	// this is the fastest mode: the four zones of a table render in parallel
	// rather than one-then-three.
	if (mode === 'none') {
		return { ready: true, referenceUrls: [], reason: 'reference mode none — text to image' };
	}

	// The lens anchors the FIRST zone only. Zones 2-4 are text-only and do
	// not wait: there is nothing for them to wait for, since they are not
	// going to reference zone 1.
	if (mode === 'lens') {
		return zoneKey === ANCHOR_ZONE
			? {
					ready: true,
					referenceUrls: lens,
					reason: lens.length ? 'anchor zone, anchored to the lens picture' : 'anchor zone, no lens picture'
				}
			: { ready: true, referenceUrls: [], reason: 'reference mode lens — this zone is text to image' };
	}

	if (zoneKey === ANCHOR_ZONE) {
		return {
			ready: true,
			referenceUrls: lens,
			reason: lens.length ? 'anchor zone, anchored to the lens picture' : 'anchor zone, no lens picture'
		};
	}

	if (state.anchorUrl) {
		return {
			ready: true,
			referenceUrls: [...lens, state.anchorUrl],
			reason: 'anchored to the lens picture and the first zone'
		};
	}

	// The anchor will never arrive, or has taken too long. Either way the
	// other three zones go ahead rather than waiting on something that is
	// not coming.
	if (state.anchorSettled) {
		return { ready: true, referenceUrls: lens, reason: 'the first zone failed — lens picture only' };
	}
	if (state.now - state.queuedAt > ANCHOR_WAIT_MS) {
		return { ready: true, referenceUrls: lens, reason: 'waited for the first zone — lens picture only' };
	}

	return { ready: false, reason: `waiting for the ${ANCHOR_ZONE} render to land` };
}

/**
 * WHAT THE REFERENCE IS ALLOWED TO DECIDE, said to the model.
 *
 * Without this line the edit endpoint reproduces the reference's FRAMING:
 * measured 20 Sep, four zones came back as the same composition as the lens
 * picture with small edits. The same run confirmed the fix — the identical
 * card, plus this instruction, recomposed into a genuinely different room.
 *
 * It matters more under `ZONE_SET=hero` than it did under four zones: one
 * image per table means twenty tables sharing six lens pictures, so a
 * framing lock would hand the judges six compositions to choose between
 * instead of twenty. The vantage and the impossible idea differentiate the
 * TEXT; this is what stops the picture overruling them.
 *
 * It leads rather than trails: it governs how the reference is read, and a
 * model that has already read a full brief treats a closing line as one
 * more detail of the scene.
 */
export const REFERENCE_INSTRUCTION =
	'Use the reference image only for palette, materials and signage style; compose a completely new scene.';

/** Prefixes {@link REFERENCE_INSTRUCTION} when, and only when, references are actually going with the submit. */
export function withReferenceInstruction(prompt: string, referenceUrls: readonly string[]): string {
	return referenceUrls.length ? `${REFERENCE_INSTRUCTION} ${prompt}` : prompt;
}

/** Makes a root-relative asset path absolute, which is what fal needs — it fetches references itself. */
export function absoluteUrl(origin: string | undefined, path: string | null): string | null {
	if (!origin || !path) return null;
	try {
		return new URL(path, origin).toString();
	} catch {
		return null;
	}
}
