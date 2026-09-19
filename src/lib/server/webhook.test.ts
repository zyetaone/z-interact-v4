import { describe, expect, it, vi } from 'vitest';
import { handleFalWebhook, type ImageRowRef, type WebhookDeps } from './webhook';

function fakeDeps(overrides: Partial<WebhookDeps> = {}): { deps: WebhookDeps } {
	let row: ImageRowRef | null = {
		eventId: 'event-1',
		table: 3,
		zone: 'zone-a',
		rev: 0,
		status: 'pending'
	};
	const deps: WebhookDeps = {
		findByRequestId: vi.fn(async () => row),
		fetchBytes: vi.fn(async () => new ArrayBuffer(4)),
		putImage: vi.fn(async () => ({ r2Key: 'event-1/3/zone-a/0.webp' })),
		markReady: vi.fn(async () => {
			row = row ? { ...row, status: 'ready' } : null;
		}),
		markFailed: vi.fn(async () => {
			row = row ? { ...row, status: 'failed' } : null;
		}),
		...overrides
	};
	return { deps };
}

describe('handleFalWebhook', () => {
	it('writes one R2 object and marks the row ready on a fresh, successful delivery', async () => {
		const { deps } = fakeDeps();
		const result = await handleFalWebhook(deps, {
			request_id: 'req-1',
			status: 'OK',
			payload: { images: [{ url: 'https://fal.example/img.webp' }] }
		});
		expect(result.handled).toBe(true);
		expect(deps.putImage).toHaveBeenCalledTimes(1);
		expect(deps.markReady).toHaveBeenCalledTimes(1);
	});

	it('is idempotent: a second delivery for an already-ready row does not write R2 again', async () => {
		let row: ImageRowRef | null = { eventId: 'e', table: 1, zone: 'z', rev: 0, status: 'pending' };
		const deps: WebhookDeps = {
			findByRequestId: vi.fn(async () => row),
			fetchBytes: vi.fn(async () => new ArrayBuffer(1)),
			putImage: vi.fn(async () => {
				row = row ? { ...row, status: 'ready' } : null;
				return { r2Key: 'e/1/z/0.webp' };
			}),
			markReady: vi.fn(async () => {
				row = row ? { ...row, status: 'ready' } : null;
			}),
			markFailed: vi.fn(async () => {})
		};
		const body = { request_id: 'req-dup', status: 'OK' as const, payload: { images: [{ url: 'https://fal.example/a.webp' }] } };

		const first = await handleFalWebhook(deps, body);
		const second = await handleFalWebhook(deps, body);

		expect(first.handled).toBe(true);
		expect(second.handled).toBe(false);
		expect(deps.putImage).toHaveBeenCalledTimes(1);
	});

	it('an unknown request_id is not handled', async () => {
		const deps: WebhookDeps = {
			findByRequestId: vi.fn(async () => null),
			fetchBytes: vi.fn(async () => new ArrayBuffer(0)),
			putImage: vi.fn(async () => ({ r2Key: '' })),
			markReady: vi.fn(async () => {}),
			markFailed: vi.fn(async () => {})
		};
		const result = await handleFalWebhook(deps, { request_id: 'ghost', status: 'OK' });
		expect(result).toEqual({ handled: false, reason: 'unknown request_id' });
		expect(deps.putImage).not.toHaveBeenCalled();
	});

	it('an ERROR status marks the row failed without touching R2', async () => {
		const { deps } = fakeDeps();
		const result = await handleFalWebhook(deps, { request_id: 'req-err', status: 'ERROR', error: 'model failed' });
		expect(result.handled).toBe(true);
		expect(deps.putImage).not.toHaveBeenCalled();
		expect(deps.markFailed).toHaveBeenCalledTimes(1);
	});
});
