import { describe, expect, it } from 'vitest';
import { secretEquals } from './secret';

describe('secretEquals', () => {
	it('matches an identical secret', () => {
		expect(secretEquals('s3cret', 's3cret')).toBe(true);
	});

	it('rejects a different or differently-sized secret', () => {
		expect(secretEquals('s3cret', 's3crey')).toBe(false);
		expect(secretEquals('s3cret', 's3cre')).toBe(false);
	});

	it('FAILS CLOSED when the expected secret is unset — the deploy-omission case', () => {
		expect(secretEquals(undefined, 'anything')).toBe(false);
		expect(secretEquals('', '')).toBe(false);
		expect(secretEquals(undefined, undefined)).toBe(false);
		expect(secretEquals(null, null)).toBe(false);
	});

	it('rejects a missing supplied token', () => {
		expect(secretEquals('s3cret', undefined)).toBe(false);
		expect(secretEquals('s3cret', '')).toBe(false);
	});
});
