import { describe, expect, it } from 'vitest';
import { MAX_COMPOSED_CHARS, composeLayers, negativeClause, sanitizeComposed, NO_TEXT, type LayerInputs, type ZoneRef } from './prompt';

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

describe('composeLayers with a negative', () => {
	it('appends the house negative just INSIDE the closing guard', () => {
		const result = composeLayers(inputs, zone, 'blurry, deformed');
		const fragments = result.split('. ');
		expect(fragments[0]).toBe(NO_TEXT);
		expect(fragments.at(-1)).toBe(NO_TEXT);
		expect(fragments.at(-2)).toBe('Avoid: blurry, deformed');
	});

	it('emits nothing for an empty negative rather than a dangling "Avoid:"', () => {
		expect(composeLayers(inputs, zone, '')).not.toContain('Avoid');
		expect(composeLayers(inputs, zone, '   ')).not.toContain('Avoid');
		expect(composeLayers(inputs, zone)).not.toContain('Avoid');
	});
});

describe('negativeClause', () => {
	it('drops the trailing full stop so the clause joins cleanly', () => {
		expect(negativeClause('text, watermarks.')).toBe('Avoid: text, watermarks');
	});
});

/**
 * Screen 15's textarea is free text that becomes the ENTIRE prompt sent to
 * a paid third-party API and then shown on a public screen. It was
 * `v.optional(v.string())` — no cap, no filtering.
 */
describe('sanitizeComposed', () => {
	it('leaves ordinary prompt text alone', () => {
		expect(sanitizeComposed('a warm library at dusk')).toBe('a warm library at dusk');
	});

	it('strips control characters instead of rejecting the paste that carried them', () => {
		expect(sanitizeComposed('a\u0000warm\u001blibrary')).toBe('a warm library');
	});

	it('collapses newlines and runs of whitespace into single spaces', () => {
		expect(sanitizeComposed('a warm\n\n   library  ')).toBe('a warm library');
	});

	it('caps the length', () => {
		const long = 'word '.repeat(1000);
		expect(sanitizeComposed(long).length).toBeLessThanOrEqual(MAX_COMPOSED_CHARS);
	});

	it('cuts on a word boundary when one is near the cut', () => {
		const out = sanitizeComposed('alpha bravo charlie delta', 14);
		expect(out).toBe('alpha bravo');
	});
});
