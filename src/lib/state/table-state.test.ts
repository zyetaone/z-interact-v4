/**
 * WHICH SCREEN THE PHONE IS ON. Two fidelity-run failures both live here:
 *
 *  - a table whose whole render set failed sat on "Being drawn" for ever,
 *    because the advance condition asked whether an image had ARRIVED rather
 *    than whether the renders had answered;
 *  - the Drawing screen and `resumeIndex` had that rule written out twice and
 *    disagreed, so a reload showed a different screen from the poll.
 *
 * `allRendersSettled` is now the single rule, and it is what both call.
 */
import { describe, expect, it } from 'vitest';
import { allRendersSettled, resumeIndex, type TableStatus } from './table.svelte';

function status(
	images: { zoneKey: string; state: string; url: string | null; error: string | null }[],
	submitted = true
): TableStatus {
	return {
		table: 3,
		future: 'solarpunk',
		era: null,
		answers: [{ questionId: 'future', keys: ['solarpunk'] }],
		prompt: 'a prompt',
		promptEdited: false,
		images,
		submittedAt: submitted ? 1 : null,
		closed: false,
		granted: false,
		canSubmit: true,
		gateReason: ''
	};
}

const zone = (state: string, url: string | null = null, error: string | null = null) => ({
	zoneKey: `z-${state}-${url ?? 'none'}`,
	state,
	url,
	error
});

describe('allRendersSettled', () => {
	it('is false while anything is still queued or requested', () => {
		expect(allRendersSettled(status([zone('stored', '/a'), zone('queued')]))).toBe(false);
		expect(allRendersSettled(status([zone('requested')]))).toBe(false);
	});

	it('is true once every row is terminal, including all-failed', () => {
		expect(allRendersSettled(status([zone('failed'), zone('failed')]))).toBe(true);
		expect(allRendersSettled(status([zone('stored', '/a'), zone('failed')]))).toBe(true);
		expect(allRendersSettled(status([zone('done', '/a')]))).toBe(true);
	});

	it('is false with no rows at all — nothing has been asked for yet', () => {
		expect(allRendersSettled(status([]))).toBe(false);
	});
});

describe('resumeIndex after submitting', () => {
	const at = (s: TableStatus) => resumeIndex(s);

	it('waits on Drawing while renders are in flight', () => {
		expect(at(status([zone('queued'), zone('requested')]))).toBe(at(status([zone('queued')])));
		// and that screen is NOT the same one a stored row lands on
		expect(at(status([zone('queued')]))).not.toBe(at(status([zone('stored', '/a')])));
	});

	it('a stored row moves the phone on, with no reload', () => {
		const drawing = at(status([zone('requested')]));
		const arrived = at(status([zone('stored', '/a')]));
		expect(arrived).toBeGreaterThan(drawing);
	});

	it('an ALL-FAILED set also moves on, so *Draw again* is reachable', () => {
		const drawing = at(status([zone('requested')]));
		const failed = at(status([zone('failed'), zone('failed'), zone('failed'), zone('failed')]));
		expect(failed).toBeGreaterThan(drawing);
		// same screen a successful table reaches — the one with *Draw again* on it
		expect(failed).toBe(at(status([zone('stored', '/a')])));
	});

	it('a partly-failed set moves on as soon as one render lands', () => {
		expect(at(status([zone('stored', '/a'), zone('failed'), zone('queued')]))).toBe(
			at(status([zone('stored', '/a')]))
		);
	});
});
