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
export function decideReferences(zoneKey: string, state: AnchorState): ReferenceDecision {
	const lens = state.lensUrl ? [state.lensUrl] : [];

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

/** Makes a root-relative asset path absolute, which is what fal needs — it fetches references itself. */
export function absoluteUrl(origin: string | undefined, path: string | null): string | null {
	if (!origin || !path) return null;
	try {
		return new URL(path, origin).toString();
	} catch {
		return null;
	}
}
