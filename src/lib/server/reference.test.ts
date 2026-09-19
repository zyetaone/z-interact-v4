/**
 * The style anchor, and the one dependency in the generation graph.
 * Every branch driven with no database and no clock.
 */
import { describe, expect, it } from 'vitest';
import {
	ANCHOR_WAIT_MS,
	ANCHOR_ZONE,
	DEFAULT_REFERENCE_MODE,
	absoluteUrl,
	decideReferences,
	referenceModeFrom,
	type AnchorState
} from './reference';
import { ZONES } from '$lib/game/zones';

const LENS = 'https://event.test/visuals/lens/solarpunk.jpg';
const ANCHOR = 'https://event.test/projector/img/e/3/library/img-1.png';
const OTHER_ZONE = ZONES.find((z) => z.key !== ANCHOR_ZONE)!.key;

function state(over: Partial<AnchorState> = {}): AnchorState {
	return { anchorUrl: null, anchorSettled: false, queuedAt: 1_000_000, now: 1_000_000, lensUrl: LENS, ...over };
}

describe('decideReferences — chain mode, the anchor zone', () => {
	it('never waits, and is anchored to the lens picture alone', () => {
		const out = decideReferences(ANCHOR_ZONE, state(), 'chain');
		expect(out.ready).toBe(true);
		expect(out.ready && out.referenceUrls).toEqual([LENS]);
	});

	it('with no lens picture it is plain text-to-image — the pre-existing behaviour', () => {
		const out = decideReferences(ANCHOR_ZONE, state({ lensUrl: null }), 'chain');
		expect(out.ready).toBe(true);
		expect(out.ready && out.referenceUrls).toEqual([]);
	});
});

describe('decideReferences — chain mode, every other zone', () => {
	it('is NOT submitted while the anchor is still rendering', () => {
		const out = decideReferences(OTHER_ZONE, state(), 'chain');
		expect(out.ready).toBe(false);
		expect(out.ready === false && out.reason).toContain(ANCHOR_ZONE);
	});

	it('goes once the anchor has landed, anchored to BOTH the lens and the first zone', () => {
		const out = decideReferences(OTHER_ZONE, state({ anchorUrl: ANCHOR }), 'chain');
		expect(out.ready).toBe(true);
		expect(out.ready && out.referenceUrls).toEqual([LENS, ANCHOR]);
	});

	it('does not wait for an anchor that failed — three good renders beat one', () => {
		const out = decideReferences(OTHER_ZONE, state({ anchorSettled: true }), 'chain');
		expect(out.ready).toBe(true);
		expect(out.ready && out.referenceUrls).toEqual([LENS]);
	});

	it('gives up on a slow anchor after the wait, with the lens picture alone', () => {
		const queuedAt = 1_000_000;
		expect(decideReferences(OTHER_ZONE, state({ queuedAt, now: queuedAt + ANCHOR_WAIT_MS }), 'chain').ready).toBe(false);
		const out = decideReferences(OTHER_ZONE, state({ queuedAt, now: queuedAt + ANCHOR_WAIT_MS + 1 }), 'chain');
		expect(out.ready).toBe(true);
		expect(out.ready && out.referenceUrls).toEqual([LENS]);
	});

	it('a landed anchor beats the timeout — the better reference is always used', () => {
		const queuedAt = 1_000_000;
		const out = decideReferences(
			OTHER_ZONE,
			state({ anchorUrl: ANCHOR, queuedAt, now: queuedAt + ANCHOR_WAIT_MS * 10 }),
			'chain'
		);
		expect(out.ready && out.referenceUrls).toEqual([LENS, ANCHOR]);
	});
});

describe('decideReferences — mode none, the default', () => {
	it('sends NO references anywhere, so every zone is a fresh text-to-image render', () => {
		for (const zone of ZONES) {
			const out = decideReferences(zone.key, state({ anchorUrl: ANCHOR }), 'none');
			expect(out.ready).toBe(true);
			expect(out.ready && out.referenceUrls).toEqual([]);
		}
	});

	it('never makes a zone wait — the four zones of a table go out together', () => {
		expect(decideReferences(OTHER_ZONE, state(), 'none').ready).toBe(true);
	});
});

describe('decideReferences — mode lens', () => {
	it('anchors the first zone to the lens picture and nothing else', () => {
		const out = decideReferences(ANCHOR_ZONE, state(), 'lens');
		expect(out.ready && out.referenceUrls).toEqual([LENS]);
	});

	it('leaves the other zones text-only, and does not make them wait for the first', () => {
		const out = decideReferences(OTHER_ZONE, state(), 'lens');
		expect(out.ready).toBe(true);
		expect(out.ready && out.referenceUrls).toEqual([]);
	});
});

describe('referenceModeFrom', () => {
	it('defaults to none, so the composition lock is off unless it is asked for', () => {
		expect(DEFAULT_REFERENCE_MODE).toBe('none');
		expect(referenceModeFrom(undefined)).toBe('none');
		expect(referenceModeFrom('')).toBe('none');
	});

	it('reads the three modes', () => {
		expect(referenceModeFrom('none')).toBe('none');
		expect(referenceModeFrom('lens')).toBe('lens');
		expect(referenceModeFrom('chain')).toBe('chain');
	});

	it('falls back to none on a typo rather than guessing — a misspelling must not turn chaining on', () => {
		expect(referenceModeFrom('Chain')).toBe('none');
		expect(referenceModeFrom('lens-only')).toBe('none');
	});
});

describe('absoluteUrl', () => {
	it('makes a root-relative asset path absolute — fal fetches references itself', () => {
		expect(absoluteUrl('https://event.test', '/visuals/lens/a.jpg')).toBe('https://event.test/visuals/lens/a.jpg');
	});

	it('is null with no origin, so a reference is dropped rather than sent unfetchable', () => {
		expect(absoluteUrl(undefined, '/visuals/lens/a.jpg')).toBeNull();
		expect(absoluteUrl('https://event.test', null)).toBeNull();
	});
});

describe('ANCHOR_ZONE', () => {
	it('tracks the active zone set rather than naming a zone that may not exist', () => {
		expect(ANCHOR_ZONE).toBe(ZONES[0].key);
	});
});
