import { describe, expect, it } from 'vitest';
import { createThrottle } from './throttle';

describe('createThrottle', () => {
	it('keys by table, never by IP — two different tables never block each other', () => {
		const t = createThrottle();
		expect(t.acquire(1)).toBe(true);
		expect(t.acquire(2)).toBe(true);
		expect(t.isBusy(1)).toBe(true);
		expect(t.isBusy(2)).toBe(true);
	});

	it("the same table's second call while the first is in flight is refused", () => {
		const t = createThrottle();
		expect(t.acquire(5)).toBe(true);
		expect(t.acquire(5)).toBe(false);
	});

	it('release frees the table for a new acquire', () => {
		const t = createThrottle();
		t.acquire(3);
		t.release(3);
		expect(t.acquire(3)).toBe(true);
	});

	it('a fresh throttle instance starts with no table busy (no cross-test leakage)', () => {
		const t = createThrottle();
		expect(t.isBusy(1)).toBe(false);
	});
});
