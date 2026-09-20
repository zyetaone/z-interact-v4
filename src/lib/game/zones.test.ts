/**
 * The zone suffixes are the ONLY thing that differs between a table's four
 * prompts once `REFERENCE_MODE` is `none`. If two of them converge, the
 * table gets the same room twice and nothing else in the pipeline notices.
 */
import { describe, expect, it } from 'vitest';
import { ZONES, ZONE_SETS } from './zones';
import { QUESTIONS } from './questions';

describe('zone moments carry the per-zone distinctness on their own', () => {
	it('names a different subject in each zone, and the moment IS the render suffix', () => {
		const moments = ZONES.map((z) => z.moment);
		expect(new Set(moments).size).toBe(ZONES.length);
		for (const zone of ZONES) expect(zone.renderSuffix).toBe(zone.moment);
	});

	it('gives every zone its own camera — "from" or "across" somewhere — so four fresh renders are not four of the same framing', () => {
		for (const zone of ZONES) expect(zone.moment).toMatch(/\b(from|across)\b/);
		const cameras = ZONES.map((z) => /^[^:;]*/.exec(z.moment)?.[0]);
		expect(new Set(cameras).size).toBe(ZONES.length);
	});

	it('puts one person in every moment — the owners references all have one', () => {
		for (const zone of ZONE_SETS.book) expect(zone.moment).toMatch(/\b(person|people|visitor|occupant)\b/);
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
