/**
 * ONE SOURCE FOR THE TITLES.
 *
 * `/` and `/projector` each had their own `+page.server.ts` carrying its own
 * `env.PUBLIC_EVENT_TITLE?.trim() || 'Twenty Tables'`. The projector's was
 * changed on 22 Sep and the front page's was not, so the wall asked the room
 * a question while the browser tab still named the furniture — found by the
 * owner looking at the page, not by any check here.
 *
 * The literal now lives in one module. This test reads the two route files
 * and fails if either grows its own fallback again, which is the only way
 * the drift can come back.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PROJECTOR_TITLE, SITE_TITLE, titleFrom } from './event-title';

const ROUTES = ['src/routes/+page.server.ts', 'src/routes/projector/+page.server.ts'];

describe('the event titles have one source', () => {
	it.each(ROUTES)('%s declares no fallback of its own', (file) => {
		const src = readFileSync(file, 'utf-8');
		const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

		// The old shape, in any spelling: an inline `|| '...'` default.
		expect(code).not.toMatch(/\|\|\s*['"]/);
		expect(code).toContain("from '$lib/event-title'");
	});

	it('neither surface still names the furniture', () => {
		expect(PROJECTOR_TITLE).not.toMatch(/twenty tables/i);
		expect(SITE_TITLE).not.toMatch(/twenty tables/i);
		expect(PROJECTOR_TITLE.trim()).not.toBe('');
		expect(SITE_TITLE.trim()).not.toBe('');
	});

	it('they are different strings, because the wall and the room are different readers', () => {
		expect(PROJECTOR_TITLE).not.toBe(SITE_TITLE);
	});

	it('PUBLIC_EVENT_TITLE overrides both, and blank or unset does not', () => {
		expect(titleFrom('Our Event 2026', SITE_TITLE)).toBe('Our Event 2026');
		expect(titleFrom('  Padded  ', SITE_TITLE)).toBe('Padded');
		expect(titleFrom(undefined, SITE_TITLE)).toBe(SITE_TITLE);
		expect(titleFrom('', PROJECTOR_TITLE)).toBe(PROJECTOR_TITLE);
		expect(titleFrom('   ', PROJECTOR_TITLE)).toBe(PROJECTOR_TITLE);
	});
});
