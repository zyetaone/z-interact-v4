/**
 * The wall-shape rule, driven with numbers instead of a browser — the one
 * piece of the projector that has to be right before anyone can judge a
 * screenshot.
 */
import { describe, expect, it } from 'vitest';
import { isWideWall, panelCount, parseAspect, WIDE_MIN_RATIO } from './aspect';

const WALL = 5760 / 1080; // the venue LED wall, ~5.33
const TV = 1920 / 1080; // the two small wall TVs, 1.78

describe('parseAspect', () => {
	it('takes the two documented values and nothing else', () => {
		expect(parseAspect('wide')).toBe('wide');
		expect(parseAspect('16x9')).toBe('16x9');
		for (const junk of [null, undefined, '', 'WIDE', '5760', 'ultrawide']) {
			expect(parseAspect(junk)).toBeNull();
		}
	});
});

describe('isWideWall', () => {
	it('picks three panels for the LED wall and 16:9 for the TVs', () => {
		expect(isWideWall(null, WALL)).toBe(true);
		expect(isWideWall(null, TV)).toBe(false);
	});

	it('puts the threshold between the two, not at either', () => {
		expect(WIDE_MIN_RATIO).toBeGreaterThan(TV);
		expect(WIDE_MIN_RATIO).toBeLessThan(WALL);
	});

	it('lets the URL win in both directions — an AV scaler lying about the frame is a typeable fix', () => {
		expect(isWideWall('wide', TV)).toBe(true);
		expect(isWideWall('16x9', WALL)).toBe(false);
	});

	it('falls back to 16:9 before the frame has been measured, rather than NaN', () => {
		expect(isWideWall(null, Number.NaN)).toBe(false);
		expect(isWideWall(null, 0)).toBe(false);
	});
});

describe('panelCount', () => {
	it('gives the venue wall three panels and a TV one', () => {
		expect(panelCount(WALL)).toBe(3);
		expect(panelCount(TV)).toBe(1);
	});

	it('never exceeds three, however wide the surface claims to be', () => {
		expect(panelCount(12)).toBe(3);
	});

	it('gives a two-panel surface two, so an odd wall is not a code change', () => {
		expect(panelCount(3.6)).toBe(2);
	});
});
