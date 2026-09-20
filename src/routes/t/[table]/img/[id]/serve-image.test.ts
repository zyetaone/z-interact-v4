/**
 * SERVING A STORED RENDER WITH THE RIGHT CONTENT TYPE.
 *
 * Fidelity bug 7: every R2 object was keyed and labelled `.webp` /
 * `image/webp` regardless of what the bytes were, and every image in that
 * run was a PNG. The write path was fixed to key and label by the sniffed
 * type; this route still carried the compensating hack — a PNG-only
 * sniffer over an `image/webp` fallback — which went on mislabelling
 * anything that was neither.
 *
 * Objects written before the fix are still in the bucket wearing the old
 * label, so both halves matter: trust the bytes, and do not invent webp.
 */
import { describe, expect, it } from 'vitest';
import { fakeD1 } from '$lib/server/fake-d1';
import { insertQueuedImage, insertPrompt, claimQueued, markStored } from '$lib/server/room';
import { GET } from './+server';

const EVENT = 'serve-image-test';
const TABLE = 3;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);

function bucketWith(entries: Map<string, { bytes: Uint8Array; contentType?: string }>): R2Bucket {
	return {
		async get(key: string) {
			const held = entries.get(key);
			if (!held) return null;
			return {
				arrayBuffer: async () => held.bytes.buffer.slice(0) as ArrayBuffer,
				httpMetadata: held.contentType ? { contentType: held.contentType } : {}
			} as never;
		}
	} as unknown as R2Bucket;
}

/** A stored row plus its object, with whatever label the bucket happens to carry. */
async function served(bytes: Uint8Array, storedContentType?: string) {
	const db = fakeD1();
	const promptId = await insertPrompt(db, {
		eventId: EVENT,
		table: TABLE,
		mood: 'm',
		material: 'mat',
		programme: 'p',
		feel: 'f',
		composed: 'c',
		negative: '',
		editedByTable: false,
		actor: 'table'
	});
	const row = await insertQueuedImage(db, {
		eventId: EVENT,
		table: TABLE,
		zoneKey: 'library',
		promptId,
		prompt: 'p',
		model: 'test-model'
	});
	const key = `${EVENT}/${TABLE}/library/${row.id}.webp`;
	await claimQueued(db, row.id);
	await markStored(db, row.id, key);

	const entries = new Map([[key, { bytes, contentType: storedContentType }]]);
	return (await GET({
		params: { table: String(TABLE), id: row.id },
		platform: { env: { DB: db, IMAGES: bucketWith(entries), EVENT_ID: EVENT } }
	} as never)) as Response;
}

describe('GET /t/[table]/img/[id]', () => {
	it('serves PNG bytes as image/png even when the object is labelled webp', async () => {
		// Exactly the state of every object written before the fix.
		const res = await served(PNG, 'image/webp');
		expect(res.headers.get('content-type')).toBe('image/png');
	});

	it('serves JPEG bytes as image/jpeg rather than falling back to webp', async () => {
		// The half the old PNG-only sniffer got wrong: not a PNG, so it took
		// the fallback, and the fallback was the very label being corrected.
		const res = await served(JPEG, 'image/webp');
		expect(res.headers.get('content-type')).toBe('image/jpeg');
	});

	it('uses the stored type when the bytes are not a format it recognises', async () => {
		const res = await served(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), 'image/avif');
		expect(res.headers.get('content-type')).toBe('image/avif');
	});

	it('never answers with no type at all', async () => {
		const res = await served(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), undefined);
		expect(res.headers.get('content-type')).toBe('image/jpeg');
	});

	it('caches immutably, since a regenerate is a new row and a new URL', async () => {
		const res = await served(PNG, 'image/png');
		expect(res.headers.get('cache-control')).toContain('immutable');
	});
});
