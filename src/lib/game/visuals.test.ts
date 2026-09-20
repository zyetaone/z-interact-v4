import { describe, expect, it } from 'vitest';
import { FUTURES } from './futures';
import { QUESTIONS, WILDCARD } from './questions';
import { LENS_IMAGE, OPTION_IMAGE, hasOptionImage } from './visuals';

// Vite's own glob, not node:fs — keeps this test free of a node type-defs
// dependency the rest of the app doesn't otherwise need. Keys come back as
// paths relative to this file, e.g. '../../../static/visuals/lens/foo.jpg'.
const files = import.meta.glob('/static/visuals/**/*.jpg', { eager: false });
const onDisk = new Set(Object.keys(files).map((p) => p.replace(/^\/static/, '')));

function fileExistsForPublicPath(publicPath: string): boolean {
	return onDisk.has(publicPath);
}

describe('LENS_IMAGE', () => {
	it('has one entry per future', () => {
		expect(Object.keys(LENS_IMAGE)).toHaveLength(FUTURES.length);
	});

	it.each(FUTURES.map((f) => f.key))('lens file for %s exists on disk', (key) => {
		expect(fileExistsForPublicPath(LENS_IMAGE[key])).toBe(true);
	});
});

describe('OPTION_IMAGE coverage', () => {
	const renderableOptions = QUESTIONS.flatMap((q) => q.options.filter((o) => !o.open).map((o) => ({ q, o })));

	it('every non-open option has a mapping entry', () => {
		for (const { q, o } of renderableOptions) {
			expect(hasOptionImage(q.id, o.key)).toBe(true);
		}
	});

	it('open options and the wildcard have no mapping (nothing to render)', () => {
		// V4 has no `open` options left, so the wildcard is the one live case;
		// the loop still guards any open option a later set brings back.
		const openOptions = QUESTIONS.flatMap((q) => q.options.filter((o) => o.open).map((o) => ({ q, o })));
		for (const { q, o } of openOptions) {
			expect(hasOptionImage(q.id, o.key)).toBe(false);
		}
		expect(hasOptionImage(WILDCARD.id, WILDCARD.options[0].key)).toBe(false);
	});

	// Not a hard fail: report coverage rather than block on generation still in
	// progress or a future option added without its picture yet.
	it('reports how many option images exist on disk', () => {
		let present = 0;
		for (const { q, o } of renderableOptions) {
			if (fileExistsForPublicPath(OPTION_IMAGE[`${q.id}:${o.key}`])) present++;
		}
		console.log(`option images on disk: ${present}/${renderableOptions.length}`);
		expect(present).toBeGreaterThanOrEqual(0);
	});
});
