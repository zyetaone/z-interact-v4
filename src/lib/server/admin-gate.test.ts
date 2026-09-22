/**
 * THE ONE ADMIN RULE — and until now, the one nothing tested.
 *
 * `adminTokenOk` decides whether `/admin`, `/admin/analytics`,
 * `/admin/photos`, `/health` and `/simulate` are open or closed. It was
 * consolidated in the 21 Sep route review out of FOUR private copies that
 * had already drifted: the desk and the readout each treated an unset token
 * as open in dev, while `/health` and `/simulate` used `secretEquals`
 * directly, which closes everywhere.
 *
 * Nothing wrong shipped, because all four closed in production. But four
 * copies of a security rule with different behaviour is how the fifth one
 * gets it wrong, and the consolidation is only safe if the surviving rule
 * is pinned. These are the four cases that matter.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ dev: false, building: false, browser: false }));

const { adminTokenOk } = await import('./admin-gate');

describe('the admin gate, in production', () => {
	it('opens for the right token', () => {
		expect(adminTokenOk('the-secret', 'the-secret')).toBe(true);
	});

	it('closes for the wrong one', () => {
		expect(adminTokenOk('the-secret', 'nearly-the-secret')).toBe(false);
		expect(adminTokenOk('the-secret', '')).toBe(false);
		expect(adminTokenOk('the-secret', null)).toBe(false);
		expect(adminTokenOk('the-secret', undefined)).toBe(false);
	});

	it('FAILS CLOSED when the variable was never set', () => {
		// The forgotten-secret case, and the whole reason this is one function.
		// An unset ADMIN_TOKEN must shut the gate, never open it — a deploy
		// that forgot the secret should look broken, not public.
		expect(adminTokenOk(undefined, 'anything')).toBe(false);
		expect(adminTokenOk('', 'anything')).toBe(false);
		expect(adminTokenOk(undefined, undefined)).toBe(false);
	});

	it('stays closed on an unset variable EVEN with devOpen, because this is production', () => {
		// `devOpen` is the desk's convenience for a local run. It is gated on
		// `dev`, which is false here — so the flag cannot open a live event by
		// itself. `/simulate` additionally never passes it, because it spends
		// with a live key.
		expect(adminTokenOk(undefined, null, { devOpen: true })).toBe(false);
		expect(adminTokenOk('', 'anything', { devOpen: true })).toBe(false);
	});

	it('still compares properly when devOpen is on and a token IS set', () => {
		expect(adminTokenOk('the-secret', 'the-secret', { devOpen: true })).toBe(true);
		expect(adminTokenOk('the-secret', 'wrong', { devOpen: true })).toBe(false);
	});
});
