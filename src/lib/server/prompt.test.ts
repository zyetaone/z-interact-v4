import { describe, expect, it } from 'vitest';
import { composeLayers, NO_TEXT, type LayerInputs, type ZoneRef } from './prompt';

const zone: ZoneRef = { key: 'zone-a', renderSuffix: 'wide shot of zone a' };

const inputs: LayerInputs = {
	mood: 'MOOD',
	materialsAndLight: 'MATERIALS',
	programme: 'PROGRAMME',
	feel: 'FEEL'
};

describe('composeLayers', () => {
	it('orders fragments: NO_TEXT, mood, materials, programme, feel, zone suffix, [wildcard], NO_TEXT', () => {
		const result = composeLayers(inputs, zone);
		const fragments = result.split('. ');
		expect(fragments).toEqual([NO_TEXT, 'MOOD', 'MATERIALS', 'PROGRAMME', 'FEEL', 'wide shot of zone a', NO_TEXT]);
	});

	it('places NO_TEXT first and last even with a wildcard appended', () => {
		const result = composeLayers({ ...inputs, wildcard: 'WILDCARD' }, zone);
		const fragments = result.split('. ');
		expect(fragments[0]).toBe(NO_TEXT);
		expect(fragments.at(-1)).toBe(NO_TEXT);
		expect(fragments).toContain('WILDCARD');
		expect(fragments.indexOf('WILDCARD')).toBe(fragments.length - 2);
	});

	it('drops empty fragments rather than emitting blank segments', () => {
		const result = composeLayers({ ...inputs, mood: '' }, zone);
		expect(result).not.toContain('..');
	});
});
