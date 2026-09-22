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

const { adminTokenOk, adminDenial } = await import('./admin-gate');

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

/*
 * THE TOKEN THE URL ATE (22 Sep).
 *
 * Reported from the live desk as "bad token" against a token that had been
 * pasted correctly. `+` is SPACE in a query string, so a base64 secret —
 * which is what `openssl rand -base64 32` produces and what anyone reaches
 * for — cannot survive `?token=` without being encoded first.
 */
describe('a base64 token that travelled through a query string', () => {
	const SECRET = 'aB3+xY7/zQ1+kL9=';
	/** What `new URL(...).searchParams.get('token')` hands the server. */
	const asDecoded = (t: string) => new URL(`https://x/?token=${t}`).searchParams.get('token');

	it('is mangled by the URL — this is the bug, not the fix', () => {
		expect(asDecoded(SECRET)).toBe('aB3 xY7/zQ1 kL9=');
		expect(asDecoded(SECRET)).not.toBe(SECRET);
	});

	it('is accepted anyway', () => {
		expect(adminTokenOk(SECRET, asDecoded(SECRET))).toBe(true);
	});

	it('still accepts a properly encoded one, which is the normal path', () => {
		expect(adminTokenOk(SECRET, asDecoded(encodeURIComponent(SECRET)))).toBe(true);
	});

	it('does not turn into a wildcard — a wrong token with spaces is still wrong', () => {
		expect(adminTokenOk(SECRET, 'aB3 xY7/zQ1 kL9X')).toBe(false);
		expect(adminTokenOk(SECRET, '   ')).toBe(false);
		expect(adminTokenOk(SECRET, ' ')).toBe(false);
	});
});

/*
 * WHAT OPENING THE DESK DID NOT OPEN.
 *
 * `ADMIN_SCREENS_OPEN` (22 Sep) removes the token from the three admin
 * screens and `/health`. It must not reach anything that SPENDS. The two
 * gates below are the ones that matter and they are enforced by a different
 * function on purpose — `adminTokenOk`, which this switch does not touch:
 *
 *   /simulate     drives the real commands with a live fal key. Opening it
 *                 puts a twenty-table render run behind a public URL.
 *   fal webhook   a shared secret is what stops anyone forging a render
 *                 completion against a row (it uses `secretEquals` directly).
 *
 * If someone later "simplifies" `adminTokenOk` into `adminDenial` because
 * they look identical now, this is the test that stops it.
 */
describe('the open desk did not open the endpoints that spend', () => {
	it('adminTokenOk is still strict, and is what /simulate calls', () => {
		expect(adminTokenOk('the-real-secret', 'wrong')).toBe(false);
		expect(adminTokenOk('the-real-secret', null)).toBe(false);
		expect(adminTokenOk('the-real-secret', '')).toBe(false);
		expect(adminTokenOk('the-real-secret', 'the-real-secret')).toBe(true);
	});

	it('still fails CLOSED when ADMIN_TOKEN is unset in production', () => {
		expect(adminTokenOk(undefined, 'anything')).toBe(false);
		expect(adminTokenOk(undefined, '')).toBe(false);
	});

	it('and adminDenial — the screens — lets everyone through', () => {
		expect(adminDenial('the-real-secret', 'wrong')).toBeNull();
		expect(adminDenial('the-real-secret', null)).toBeNull();
		expect(adminDenial(undefined, undefined)).toBeNull();
	});
});
