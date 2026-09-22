/**
 * THE WAITING SCREENS HAVE TO MOVE.
 *
 * `class-hooks.test.ts` proves every class in the markup resolves to a rule.
 * It cannot prove the rule still animates — and a shimmer whose `animation`
 * line is deleted degrades into exactly the flat box it replaced, with no
 * error anywhere. For the two minutes a table stares at this screen, a still
 * frame and a dead app look the same on a phone.
 *
 * Static, no browser: read the files and assert the three pieces are wired.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('src/app.css', 'utf-8');
const drawing = readFileSync('src/lib/ui/table/DrawingScreen.svelte', 'utf-8');
const gallery = readFileSync('src/lib/ui/table/ImagesScreen.svelte', 'utf-8');

describe('the skeleton shimmers', () => {
	it('app.css defines the animation, not just the class', () => {
		expect(css).toMatch(/\.skeleton\s*\{[^}]*animation:\s*shimmer/);
		expect(css).toMatch(/@keyframes shimmer/);
	});

	it('both waiting screens use it', () => {
		expect(drawing).toContain('class:skeleton=');
		expect(gallery).toContain('class:skeleton=');
	});

	it('a failed frame does NOT shimmer — movement would read as progress', () => {
		expect(drawing).toMatch(/class:skeleton=\{image\.state !== 'failed'\}/);
		expect(gallery).toMatch(/class:skeleton=\{image\.state !== 'failed'\}/);
	});

	it('the frame reserves the picture\'s aspect ratio, so nothing reflows', () => {
		expect(drawing).toMatch(/aspect-ratio:\s*3 \/ 2/);
		expect(drawing).toMatch(/aspect-ratio:\s*16 \/ 9/);
	});
});

describe('the brand mark breathes while the render runs', () => {
	it('is animated, and is on the DRAWING screen — the moment it describes', () => {
		expect(css).toMatch(/\.brand-tick\s*\{[^}]*animation:\s*brand-tick/);
		expect(drawing).toContain('class="brand-tick"');
	});

	it('animates the LAST GLYPH positionally, never a letter named in source', () => {
		// CLAUDE.md's first rule: no client, event or company name in this
		// repo. The brand is a deploy value, so the markup cannot know which
		// character it is animating — only that it is the final one.
		expect(drawing).toContain('line.slice(-1)');
		expect(drawing).not.toMatch(/Zyeta/i);
	});

	it('renders nothing at all when BRAND_LINE is unset', () => {
		expect(drawing).toMatch(/if \(!line\) return null/);
	});
});

describe('a render can be enlarged on a phone', () => {
	it('the arrived picture is a button, with a label', () => {
		expect(gallery).toMatch(/<button[\s\S]{0,200}class="open"/);
		expect(gallery).toContain('aria-label="Enlarge our');
	});

	it('the overlay closes on tap AND on Escape', () => {
		expect(gallery).toContain('zoomed = null');
		expect(gallery).toMatch(/e\.key === 'Escape'/);
	});
});

describe('reduced motion is honoured', () => {
	it('turns both animations off rather than leaving one running', () => {
		const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) ?? [];
		const joined = block.join('\n');
		expect(joined).toContain('.skeleton');
		expect(joined).toContain('.brand-tick');
	});
});

describe('the front page shows a table at work', () => {
	const front = readFileSync('src/routes/+page.svelte', 'utf-8');

	it('distinguishes in-flight from never-started — both used to show a QR code', () => {
		expect(front).toContain('function drawingOf');
		expect(front).toMatch(/i\.state === 'queued' \|\| i\.state === 'requested'/);
		expect(front).toContain('class:drawing');
	});

	it('a failed or finished table does NOT shimmer', () => {
		// drawingOf tests only the two live states, so `stored`/`done`/`failed`
		// fall through. Movement reads as progress; there is none.
		const fn = front.slice(front.indexOf('function drawingOf'));
		const body = fn.slice(0, fn.indexOf('\n\t}'));
		expect(body).not.toContain('failed');
		expect(body).not.toContain('stored');
	});
});
