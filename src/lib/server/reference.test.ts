/**
 * The style anchor, and the one dependency in the generation graph.
 * Every branch driven with no database and no clock.
 */
import { describe, expect, it } from 'vitest';
import { ANCHOR_WAIT_MS, ANCHOR_ZONE, absoluteUrl, decideReferences, type AnchorState } from './reference';
import { ZONES } from '$lib/game/zones';

const LENS = 'https://event.test/visuals/lens/solarpunk.jpg';
const ANCHOR = 'https://event.test/projector/img/e/3/library/img-1.png';
const OTHER_ZONE = ZONES.find((z) => z.key !== ANCHOR_ZONE)!.key;

function state(over: Partial<AnchorState> = {}): AnchorState {
	return { anchorUrl: null, anchorSettled: false, queuedAt: 1_000_000, now: 1_000_000, lensUrl: LENS, ...over };
}

describe('decideReferences — the anchor zone', () => {
	it('never waits, and is anchored to the lens picture alone', () => {
		const out = decideReferences(ANCHOR_ZONE, state());
		expect(out.ready).toBe(true);
		expect(out.ready && out.referenceUrls).toEqual([LENS]);
	});

	it('with no lens picture it is plain text-to-image — the pre-existing behaviour', () => {
		const out = decideReferences(ANCHOR_ZONE, state({ lensUrl: null }));
		expect(out.ready).toBe(true);
		expect(out.ready && out.referenceUrls).toEqual([]);
	});
});

describe('decideReferences — every other zone', () => {
	it('is NOT submitted while the anchor is still rendering', () => {
		const out = decideReferences(OTHER_ZONE, state());
		expect(out.ready).toBe(false);
		expect(out.ready === false && out.reason).toContain(ANCHOR_ZONE);
	});

	it('goes once the anchor has landed, anchored to BOTH the lens and the first zone', () => {
		const out = decideReferences(OTHER_ZONE, state({ anchorUrl: ANCHOR }));
		expect(out.ready).toBe(true);
		expect(out.ready && out.referenceUrls).toEqual([LENS, ANCHOR]);
	});

	it('does not wait for an anchor that failed — three good renders beat one', () => {
		const out = decideReferences(OTHER_ZONE, state({ anchorSettled: true }));
		expect(out.ready).toBe(true);
		expect(out.ready && out.referenceUrls).toEqual([LENS]);
	});

	it('gives up on a slow anchor after the wait, with the lens picture alone', () => {
		const queuedAt = 1_000_000;
		expect(decideReferences(OTHER_ZONE, state({ queuedAt, now: queuedAt + ANCHOR_WAIT_MS })).ready).toBe(false);
		const out = decideReferences(OTHER_ZONE, state({ queuedAt, now: queuedAt + ANCHOR_WAIT_MS + 1 }));
		expect(out.ready).toBe(true);
		expect(out.ready && out.referenceUrls).toEqual([LENS]);
	});

	it('a landed anchor beats the timeout — the better reference is always used', () => {
		const queuedAt = 1_000_000;
		const out = decideReferences(
			OTHER_ZONE,
			state({ anchorUrl: ANCHOR, queuedAt, now: queuedAt + ANCHOR_WAIT_MS * 10 })
		);
		expect(out.ready && out.referenceUrls).toEqual([LENS, ANCHOR]);
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
