/**
 * The zone suffixes are the ONLY thing that differs between a table's four
 * prompts once `REFERENCE_MODE` is `none`. If two of them converge, the
 * table gets the same room twice and nothing else in the pipeline notices.
 */
import { describe, expect, it } from 'vitest';
import { ZONES, ZONE_SETS } from './zones';

describe('zone suffixes carry the per-zone distinctness on their own', () => {
	it('names a different room type in each zone', () => {
		const suffixes = ZONES.map((z) => z.renderSuffix);
		expect(new Set(suffixes).size).toBe(ZONES.length);
	});

	it('gives every zone its own camera, so four fresh renders are not four of the same framing', () => {
		for (const zone of ZONES) expect(zone.renderSuffix).toMatch(/one wide view/);
		const cameras = ZONES.map((z) => /one wide view[^:]*/.exec(z.renderSuffix)?.[0]);
		expect(new Set(cameras).size).toBe(ZONES.length);
	});

	it('says every zone is part of one building — the continuity the reference image used to carry', () => {
		for (const zone of ZONE_SETS.book) expect(zone.renderSuffix).toContain('the same building');
	});
});
