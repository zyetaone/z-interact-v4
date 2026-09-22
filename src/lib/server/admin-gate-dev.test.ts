/**
 * The same rule with `dev` TRUE — the other half of `devOpen`.
 *
 * Its own file because `$app/environment`'s `dev` is module-level and the
 * production behaviour is pinned next door in `admin-gate.test.ts`. Two
 * files is the cheapest honest way to assert both.
 *
 * What this protects: `devOpen` exists so a local `npm run dev` with no
 * `.dev.vars` still opens the desk. It must open ONLY when the variable is
 * genuinely unset — never as a way past a token that IS set, and never
 * unless the caller asked for it.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ dev: true, building: false, browser: false }));

const { adminTokenOk } = await import('./admin-gate');

describe('the admin gate, in dev', () => {
	it('opens an unset token only when the caller passes devOpen', () => {
		expect(adminTokenOk(undefined, null, { devOpen: true })).toBe(true);
		// The default is the strict rule. `/simulate` relies on this: it never
		// passes devOpen, because it spends with a live key.
		expect(adminTokenOk(undefined, null)).toBe(false);
	});

	it('never lets devOpen bypass a token that IS set', () => {
		// The dangerous misreading of this flag. A developer with a real token
		// in .dev.vars must still send it.
		expect(adminTokenOk('the-secret', 'wrong', { devOpen: true })).toBe(false);
		expect(adminTokenOk('the-secret', null, { devOpen: true })).toBe(false);
		expect(adminTokenOk('the-secret', 'the-secret', { devOpen: true })).toBe(true);
	});
});
