import { describe, expect, it } from 'vitest';
import { decideSubmit } from './gate';

describe('decideSubmit', () => {
	it('unreachable D1 fails closed with 503', () => {
		const d = decideSubmit({ reachable: false, locked: false, alreadyAnswered: false, granted: false });
		expect(d).toEqual({ ok: false, status: 503, reason: expect.any(String) });
	});

	it('a locked room blocks a fresh submit with 409', () => {
		const d = decideSubmit({ reachable: true, locked: true, alreadyAnswered: false, granted: false });
		expect(d.ok).toBe(false);
		if (!d.ok) expect(d.status).toBe(409);
	});

	it('an unlocked, first-time submit is allowed and consumes no grant', () => {
		const d = decideSubmit({ reachable: true, locked: false, alreadyAnswered: false, granted: false });
		expect(d).toEqual({ ok: true, consumeGrant: false });
	});

	it('unlocked + ungranted + already-answered still blocks (409)', () => {
		const d = decideSubmit({ reachable: true, locked: false, alreadyAnswered: true, granted: false });
		expect(d.ok).toBe(false);
		if (!d.ok) expect(d.status).toBe(409);
	});

	it('a reopen grant allows exactly one resubmit (and asks the caller to consume it)', () => {
		const d = decideSubmit({ reachable: true, locked: false, alreadyAnswered: true, granted: true });
		expect(d).toEqual({ ok: true, consumeGrant: true });
	});

	it('lock takes priority over a live grant', () => {
		const d = decideSubmit({ reachable: true, locked: true, alreadyAnswered: true, granted: true });
		expect(d.ok).toBe(false);
		if (!d.ok) expect(d.status).toBe(409);
	});
});
