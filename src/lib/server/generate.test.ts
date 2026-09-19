import { describe, expect, it, vi } from 'vitest';
import { tick, isTerminal, type GenerateDeps, type GenerationRow } from './generate';

function row(overrides: Partial<GenerationRow> = {}): GenerationRow {
	return {
		id: 'img-1',
		state: 'queued',
		falRequestId: null,
		prompt: 'a prompt',
		requestKey: '1:overview',
		...overrides
	};
}

function fakeDeps(overrides: Partial<GenerateDeps> = {}): GenerateDeps {
	return {
		submit: vi.fn(async () => ({ requestId: 'req-1' })),
		pollStatus: vi.fn(async () => ({ status: 'COMPLETED' as const })),
		fetchResult: vi.fn(async () => ({ imageUrl: 'https://fal.example/a.webp' })),
		fetchBytes: vi.fn(async () => new ArrayBuffer(4)),
		putR2: vi.fn(async () => ({ r2Key: 'event/1/overview/img-1.webp' })),
		...overrides
	};
}

describe('tick', () => {
	it('queued -> requested: submits to fal and returns the fal request id', async () => {
		const deps = fakeDeps();
		const result = await tick(row({ state: 'queued' }), deps);
		expect(result).toEqual({ handled: true, nextState: 'requested', falRequestId: 'req-1' });
		expect(deps.submit).toHaveBeenCalledWith('a prompt', '1:overview');
	});

	it('requested + COMPLETED -> stored: fetches, downloads and stores bytes', async () => {
		const deps = fakeDeps();
		const result = await tick(row({ state: 'requested', falRequestId: 'req-1' }), deps);
		expect(result).toEqual({ handled: true, nextState: 'stored', r2Key: 'event/1/overview/img-1.webp' });
		expect(deps.pollStatus).toHaveBeenCalledWith('req-1');
		expect(deps.putR2).toHaveBeenCalledTimes(1);
	});

	it('requested + still IN_PROGRESS: no-op, does not fetch or store', async () => {
		const deps = fakeDeps({ pollStatus: vi.fn(async () => ({ status: 'IN_PROGRESS' as const })) });
		const result = await tick(row({ state: 'requested', falRequestId: 'req-1' }), deps);
		expect(result.handled).toBe(false);
		expect(deps.fetchResult).not.toHaveBeenCalled();
		expect(deps.putR2).not.toHaveBeenCalled();
	});

	it('requested with no fal_request_id cannot resume — no-op rather than a throw', async () => {
		const deps = fakeDeps();
		const result = await tick(row({ state: 'requested', falRequestId: null }), deps);
		expect(result).toEqual({ handled: false, reason: expect.any(String) });
		expect(deps.pollStatus).not.toHaveBeenCalled();
	});

	it('requested + ERROR -> failed: the row reaches a terminal state, not an endless wait', async () => {
		// The bug this closes: every non-COMPLETED status used to return
		// `handled: false`, so a real fal failure left the row `requested` with
		// no ticker able to move it and the table stuck on the Drawing screen.
		const deps = fakeDeps({
			pollStatus: vi.fn(async () => ({ status: 'ERROR' as const, error: 'content policy' }))
		});
		const result = await tick(row({ state: 'requested', falRequestId: 'req-1' }), deps);
		expect(result).toEqual({ handled: true, nextState: 'failed', reason: 'content policy' });
		expect(deps.fetchResult).not.toHaveBeenCalled();
		expect(deps.putR2).not.toHaveBeenCalled();
	});

	it('an ERROR with no reason still fails, with a sentence a table can read', async () => {
		const deps = fakeDeps({ pollStatus: vi.fn(async () => ({ status: 'ERROR' as const })) });
		const result = await tick(row({ state: 'requested', falRequestId: 'req-1' }), deps);
		expect(result).toEqual({
			handled: true,
			nextState: 'failed',
			reason: 'the image model reported an error'
		});
	});

	it('ticking a stored row is a no-op — no dependency is called', async () => {
		const deps = fakeDeps();
		const result = await tick(row({ state: 'stored' }), deps);
		expect(result).toEqual({ handled: false, reason: expect.any(String) });
		expect(deps.submit).not.toHaveBeenCalled();
		expect(deps.pollStatus).not.toHaveBeenCalled();
		expect(deps.fetchResult).not.toHaveBeenCalled();
		expect(deps.fetchBytes).not.toHaveBeenCalled();
		expect(deps.putR2).not.toHaveBeenCalled();
	});

	it('ticking a done or failed row is also a no-op', async () => {
		const deps = fakeDeps();
		await tick(row({ state: 'done' }), deps);
		await tick(row({ state: 'failed' }), deps);
		expect(deps.submit).not.toHaveBeenCalled();
		expect(deps.pollStatus).not.toHaveBeenCalled();
	});

	it('a second, duplicate ticker (e.g. a repeat webhook delivery) racing a completed row also no-ops', async () => {
		// Simulates: ticker A already moved queued -> requested -> stored.
		// Ticker B (a duplicate webhook, or the admin poll) ticks the same row
		// again after reading it — same guard as the "stored" test above,
		// stated from the double-delivery angle the brief asked about.
		const deps = fakeDeps();
		const alreadyStored = row({ state: 'stored' });
		const result = await tick(alreadyStored, deps);
		expect(result.handled).toBe(false);
		expect(deps.putR2).not.toHaveBeenCalled();
	});
});

describe('isTerminal', () => {
	it('stored, done and failed are terminal; queued and requested are not', () => {
		expect(isTerminal('stored')).toBe(true);
		expect(isTerminal('done')).toBe(true);
		expect(isTerminal('failed')).toBe(true);
		expect(isTerminal('queued')).toBe(false);
		expect(isTerminal('requested')).toBe(false);
	});
});
