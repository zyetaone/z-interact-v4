/**
 * The zone suffixes are the ONLY thing that differs between a table's four
 * prompts once `REFERENCE_MODE` is `none`. If two of them converge, the
 * table gets the same room twice and nothing else in the pipeline notices.
 */
import { describe, expect, it } from 'vitest';
import { ZONES, ZONE_SETS } from './zones';
import { QUESTIONS } from './questions';

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

describe('zone ownership cites real V4 question ids', () => {
	const ids = new Set(QUESTIONS.map((q) => q.id));

	it('every questionId in every set is a question that exists', () => {
		for (const zones of Object.values(ZONE_SETS)) {
			for (const zone of zones) for (const id of zone.questionIds) expect(ids.has(id), `${zone.key} cites ${id}`).toBe(true);
		}
	});

	it('every {qN} placeholder in a suffix is one of that zones own questionIds', () => {
		for (const zones of Object.values(ZONE_SETS)) {
			for (const zone of zones) {
				const placeholders = [...zone.renderSuffix.matchAll(/\{(q\w+)\}/g)].map((m) => m[1]);
				expect(placeholders.sort()).toEqual([...zone.questionIds].sort());
			}
		}
	});

	it('the questions set gives every zone-worthy V4 question exactly one zone', () => {
		const owned = ZONE_SETS.questions.flatMap((z) => z.questionIds);
		expect(owned.sort()).toEqual(['q3', 'q4w', 'q5c', 'q6r']);
	});
});
