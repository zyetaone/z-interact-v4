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
	// The split moved into BrandMark.svelte when the waiting FRAME started
	// showing it too — two call sites, and "everything but the last
	// character" is the kind of logic that drifts if it is written twice.
	const mark = readFileSync('src/lib/ui/table/BrandMark.svelte', 'utf-8');

	it('is animated, and is inside the frame — the moment it describes', () => {
		expect(css).toMatch(/\.brand-tick\s*\{[^}]*animation:\s*brand-tick/);
		expect(mark).toContain('class="brand-tick"');
		expect(drawing).toContain('<BrandMark line={brand} />');
	});

	it('animates the LAST GLYPH positionally, never a letter named in source', () => {
		// CLAUDE.md's first rule: no client, event or company name in this
		// repo. The brand is a deploy value, so the markup cannot know which
		// character it is animating — only that it is the final one.
		expect(mark).toContain('text.slice(-1)');
		expect(mark).not.toMatch(/Zyeta/i);
	});

	it('renders nothing at all when BRAND_LINE is unset', () => {
		expect(mark).toMatch(/if \(!text\) return null/);
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

describe('the shimmer actually travels across the frame', () => {
	/**
	 * Photographed on production 22 Sep: two frames a second apart, pixel
	 * identical. The animation WAS running — the highlight was just parked
	 * off-canvas for most of an ease-in-out cycle, because percentage
	 * background-position resolves against (container - image) and the image
	 * is 200% of the container, making that term negative. A ±200% range
	 * sweeps four container widths; ±100% sweeps two, which is one pass.
	 */
	it('sweeps ±100%, not ±200% — the range is the bug, not the animation', () => {
		const frames = css.match(/@keyframes shimmer \{[\s\S]*?\n\}/)?.[0] ?? '';
		expect(frames).toContain('background-position: 100% 0');
		expect(frames).toContain('background-position: -100% 0');
		expect(frames).not.toContain('200% 0');
	});

	it('the highlight is visible against the navy it sits on', () => {
		// 0.07 cream over #1a2740 is a four-step delta — it survives neither a
		// projector nor a phone at arm's length in a lit room.
		const rule = css.match(/\.skeleton \{[\s\S]*?\n\}/)?.[0] ?? '';
		const alpha = Number(rule.match(/rgba\(244, 237, 224, ([\d.]+)\)/)?.[1] ?? 0);
		expect(alpha).toBeGreaterThanOrEqual(0.12);
	});

	it('the front page sheen does NOT reuse .skeleton — its base is opaque', () => {
		const front = readFileSync('src/routes/+page.svelte', 'utf-8');
		expect(front).toContain('<span class="sheen"');
		expect(front).not.toContain('class="sheen skeleton"');
		// Same keyframes, transparent base.
		expect(front).toMatch(/\.sheen \{[\s\S]*?animation: shimmer/);
	});
});

describe('the loader says the brand, not the machine state', () => {
	const mark = readFileSync('src/lib/ui/table/BrandMark.svelte', 'utf-8');
	const line = readFileSync('src/lib/ui/table/generation-line.ts', 'utf-8');

	it('both waiting surfaces show it while a render is in flight', () => {
		for (const src of [drawing, gallery]) {
			expect(src).toContain('<BrandMark line={brand} />');
			expect(src).toContain('waitingLabel(image.state) && brand.trim()');
		}
	});

	it('only the states where the table is genuinely waiting on us', () => {
		// A terminal state has something to say — `failed — draw again` is an
		// instruction — and an unknown state is a bug to show, not paper over.
		const block = line.match(/const WAITING[\s\S]*?\n\};/)?.[0] ?? '';
		expect(block).toMatch(/queued: true/);
		expect(block).toMatch(/requested: true/);
		expect(block).toMatch(/failed: false/);
		expect(block).toMatch(/stored: false/);
	});

	it('falls back to the state line when BRAND_LINE is unset', () => {
		// Otherwise an unbranded deploy shows an empty frame.
		expect(drawing).toContain('generationLine(image.state)');
		expect(gallery).toContain('still drawing');
	});

	it('still animates the last glyph positionally, never a named letter', () => {
		expect(mark).toContain('text.slice(-1)');
		expect(mark).toContain('class="brand-tick"');
		expect(mark).not.toMatch(/Zyeta/i);
	});
});

describe('a finished render is not a screen you go Back from', () => {
	const flow = readFileSync('src/lib/state/table.svelte.ts', 'utf-8');

	it('images joins drawing and done as a one-way screen', () => {
		const rule = flow.match(/get canGoBack\(\) \{[\s\S]*?\n {4}\},/)?.[0] ?? '';
		expect(rule).toContain('"drawing"');
		expect(rule).toContain('"images"');
		expect(rule).toContain('"done"');
	});
});
