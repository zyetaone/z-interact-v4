import { describe, expect, it } from 'vitest';
import { ERA_SCALE, allowedEras, nudge, type Era } from './era';

/**
 * Ports futures.md §5's block/allow table pair by pair. That table was
 * enumerated by hand over there (Garden City/Solarpunk/Broadacre allow the
 * full neighbour window; Arcology/Neo-Seoul block both 2026 and 1930s;
 * Retrofuturism and Pragmatist Retrofit are locked to their own era) —
 * `allowedEras` derives it from the ordered scale here. If these ever
 * disagree, one of us changed the palette without saying so.
 */
const ERA_RULE_FIXTURES: ReadonlyArray<[Era, boolean, Era[]]> = [
	// Garden City, Solarpunk, Broadacre — recognisably-2035, not locked
	['recognisably-2035', false, ['same-as-2026', 'recognisably-2035', 'hyperfuturistic-2040']],
	// Arcology, Neo-Seoul — hyperfuturistic-2040, not locked (2026 and 1930s blocked)
	['hyperfuturistic-2040', false, ['recognisably-2035', 'hyperfuturistic-2040']],
	// Retrofuturism — locked to retro-1930s
	['retro-1930s', true, ['retro-1930s']],
	// Pragmatist Retrofit — locked to same-as-2026
	['same-as-2026', true, ['same-as-2026']]
];

describe('allowedEras', () => {
	it.each(ERA_RULE_FIXTURES)('window for %s (locked=%s) is %j', (eraDefault, eraLocked, expected) => {
		expect(allowedEras({ eraDefault, eraLocked })).toEqual(expected);
	});
});

describe('ERA_SCALE', () => {
	it('has exactly Q1s four options, in order', () => {
		expect(ERA_SCALE).toEqual(['retro-1930s', 'same-as-2026', 'recognisably-2035', 'hyperfuturistic-2040']);
	});
});

describe('nudge', () => {
	it('moves one step later', () => {
		expect(nudge('same-as-2026', 'later')).toBe('recognisably-2035');
	});

	it('moves one step earlier', () => {
		expect(nudge('recognisably-2035', 'earlier')).toBe('same-as-2026');
	});

	it('clamps at the late end', () => {
		expect(nudge('hyperfuturistic-2040', 'later')).toBe('hyperfuturistic-2040');
	});

	it('clamps at the early end', () => {
		expect(nudge('retro-1930s', 'earlier')).toBe('retro-1930s');
	});
});
