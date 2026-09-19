/**
 * The unknown-status rule. fal's live vocabulary is IN_QUEUE / IN_PROGRESS /
 * COMPLETED; everything else has to read as ERROR, because the alternative
 * (the pre-change behaviour) is a row no ticker can ever advance.
 */
import { describe, expect, it } from 'vitest';
import { falErrorText, normaliseStatus } from './fal';

describe('normaliseStatus', () => {
	it('passes fal\'s three live states through unchanged', () => {
		expect(normaliseStatus({ status: 'IN_QUEUE', queue_position: 3 })).toEqual({
			status: 'IN_QUEUE',
			queuePosition: 3
		});
		expect(normaliseStatus({ status: 'IN_PROGRESS' })).toEqual({ status: 'IN_PROGRESS', queuePosition: undefined });
		expect(normaliseStatus({ status: 'COMPLETED' })).toEqual({ status: 'COMPLETED' });
	});

	it('reads an explicit ERROR status as ERROR and keeps its reason', () => {
		const out = normaliseStatus({ status: 'ERROR', error: 'content policy' });
		expect(out.status).toBe('ERROR');
		expect(out.error).toBe('content policy');
	});

	it('reads an UNMODELLED status as ERROR rather than "not ready yet"', () => {
		// The exact regression: a status string this app has never seen used to
		// fall through the `!== 'COMPLETED'` branch as a wait, for ever.
		const out = normaliseStatus({ status: 'CANCELLED' });
		expect(out.status).toBe('ERROR');
		expect(out.error).toContain('CANCELLED');
	});

	it('reads a missing status with an error payload as ERROR', () => {
		const out = normaliseStatus({ detail: 'invalid model id' });
		expect(out).toEqual({ status: 'ERROR', error: 'invalid model id' });
	});

	it('caps the reason so an upstream error can never bloat the stored row', () => {
		const out = normaliseStatus({ status: 'ERROR', error: 'x'.repeat(5000) });
		expect(out.error!.length).toBe(200);
	});
});

describe('falErrorText', () => {
	it('serialises a structured error rather than printing [object Object]', () => {
		expect(falErrorText({ code: 422, message: 'bad prompt' })).toContain('bad prompt');
	});

	it('falls back to a plain sentence when fal said nothing useful', () => {
		expect(falErrorText(undefined)).toBe('the image model reported an error');
	});
});
