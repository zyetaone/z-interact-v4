import { describe, expect, it } from 'vitest';
import {
	DEFAULT_MAX_RENDERS_PER_TABLE,
	REGENERATE_COOLDOWN_MS,
	checkCooldown,
	checkRenderCap,
	maxRendersPerTable
} from './limits';

describe('maxRendersPerTable', () => {
	it('reads a valid integer from the environment', () => {
		expect(maxRendersPerTable('20')).toBe(20);
	});

	it('falls back to the default on anything unparseable — a typo must not read as "no cap"', () => {
		for (const bad of [undefined, '', 'twelve', '0', '-4', '3.5', 'NaN']) {
			expect(maxRendersPerTable(bad)).toBe(DEFAULT_MAX_RENDERS_PER_TABLE);
		}
	});
});

describe('checkRenderCap', () => {
	it('allows a call that lands exactly on the cap', () => {
		expect(checkRenderCap({ used: 8, about: 4, max: 12 })).toEqual({ ok: true });
	});

	it('refuses the call that would cross it, naming the number', () => {
		const out = checkRenderCap({ used: 9, about: 4, max: 12 });
		expect(out.ok).toBe(false);
		expect(out.ok === false && out.reason).toContain('12');
	});
});

describe('checkCooldown', () => {
	it('a table that has never drawn is never cooling down', () => {
		expect(checkCooldown({ lastRenderAt: 0, now: 1_000_000 })).toEqual({ ok: true });
	});

	it('refuses inside the window and says how long is left', () => {
		const now = 1_000_000;
		const out = checkCooldown({ lastRenderAt: now - 20_000, now });
		expect(out.ok).toBe(false);
		expect(out.ok === false && out.reason).toContain('40');
	});

	it('allows once the window has passed', () => {
		const now = 1_000_000;
		expect(checkCooldown({ lastRenderAt: now - REGENERATE_COOLDOWN_MS, now })).toEqual({ ok: true });
	});
});
