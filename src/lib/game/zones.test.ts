/**
 * The zone suffixes are the ONLY thing that differs between a table's four
 * prompts once `REFERENCE_MODE` is `none`. If two of them converge, the
 * table gets the same room twice and nothing else in the pipeline notices.
 */
import { describe, expect, it } from 'vitest';
import { activeZones, isHeroZone, zoneByKey, zoneLabel, zoneSetFrom, ZONES, ZONE_SETS } from './zones';
import { QUESTIONS } from './questions';

describe('zone moments carry the per-zone distinctness on their own', () => {
	it('names a different subject in each zone, and the moment IS the render suffix', () => {
		const moments = ZONES.map((z) => z.moment);
		expect(new Set(moments).size).toBe(ZONES.length);
		for (const zone of ZONES) expect(zone.renderSuffix).toBe(zone.moment);
	});

	it('opens every zone on a different act, so four fresh renders are not four of the same scene (the camera comes from the scale And)', () => {
		const acts = ZONES.map((z) => /^[^:;]*/.exec(z.moment)?.[0]);
		expect(new Set(acts).size).toBe(ZONES.length);
	});

	it('states every moment as an act in progress — people mid-action, never a room with someone posed', () => {
		for (const zone of ZONE_SETS.book) expect(zone.moment).toMatch(/\b(mid-act|mid-task|mid-motion|arriving)\b/);
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

describe('ZONE_SET — which zones render', () => {
	it('defaults to the one hero zone, and a typo does not quintuple the spend', () => {
		for (const raw of [undefined, '', 'hero', 'HERO', 'four-zones', 'yes', 'null']) {
			const zones = activeZones(raw);
			expect(zones).toHaveLength(1);
			expect(zones[0].key).toBe('workspace');
			expect(zones[0].hero).toBe(true);
		}
	});

	it('renders the four functional zones on "four", and five on "all"', () => {
		const four = activeZones('four');
		expect(four).toHaveLength(4);
		expect(four.some((z) => z.hero)).toBe(false);

		const all = activeZones('all');
		expect(all).toHaveLength(5);
		// The hero leads, so a projector or a phone showing the first tile shows
		// the one that is the table's answer.
		expect(all[0].key).toBe('workspace');
		expect(new Set(all.map((z) => z.key)).size).toBe(5);
	});

	it('names the raw value the same way everywhere', () => {
		expect(zoneSetFrom('four')).toBe('four');
		expect(zoneSetFrom('all')).toBe('all');
		expect(zoneSetFrom('nonsense')).toBe('hero');
		expect(zoneSetFrom(undefined)).toBe('hero');
	});

	it('hands back a copy, so a caller cannot mutate the zone set', () => {
		const zones = activeZones('four');
		zones.pop();
		expect(activeZones('four')).toHaveLength(4);
	});
});

describe('zoneByKey — lookups outlive the variable', () => {
	it('finds a zone from EVERY set, not just the active one', () => {
		// A table rendered under `four` and read under `hero` still has four
		// image rows; a lookup restricted to the active set would fail to find
		// the definition for a row that plainly exists.
		expect(zoneByKey('workspace')?.hero).toBe(true);
		for (const key of ['library', 'studio', 'plaza', 'garden']) expect(zoneByKey(key)).toBeDefined();
		for (const key of ['arrival', 'workstation', 'deep-work', 'recharge']) expect(zoneByKey(key)).toBeDefined();
		expect(zoneByKey('not-a-zone')).toBeUndefined();
	});

	it('knows which key is the hero', () => {
		expect(isHeroZone('workspace')).toBe(true);
		expect(isHeroZone('library')).toBe(false);
		expect(isHeroZone('not-a-zone')).toBe(false);
	});

	it('labels the hero as the whole thing, not a fifth room', () => {
		expect(zoneLabel('workspace')).toBe('Your workspace');
		expect(zoneLabel('library')).toBe('Library');
	});
});
