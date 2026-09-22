/**
 * A SCOPED `background` SHORTHAND SILENTLY DISARMS `.skeleton`.
 *
 * `.skeleton` lives in app.css and supplies THREE things: a gradient
 * (`background-image`), a `background-size`, and the animation. A component
 * that also writes a bare `background:` on the same element sets a
 * SHORTHAND, which resets `background-image` and `background-size` to their
 * initial values — and Svelte's scoping class lifts that rule above the
 * global one, so it wins.
 *
 * The result is the worst kind of broken: the animation is genuinely
 * running. Measured on production 22 Sep with getComputedStyle —
 * `animationName: "shimmer"`, `playState: "running"`,
 * `backgroundImage: "none"`. Two screenshots a second apart were identical
 * and the frame read as a dead box.
 *
 * class-hooks.test.ts states in its own header that it does NOT catch a
 * rule losing a specificity fight. This is that gap, closed for this one
 * class — which is the one that matters, because a skeleton that does not
 * move is indistinguishable from a hung app.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function svelteFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) return svelteFiles(full);
		return full.endsWith('.svelte') ? [full] : [];
	});
}

/** The classes an element carrying `class:skeleton` ALSO has, per component. */
function skeletonCompanions(markup: string): string[] {
	const out = new Set<string>();
	// Match the element's opening tag around a `class:skeleton` directive.
	for (const tag of markup.matchAll(/<[a-zA-Z][^>]*class:skeleton[^>]*>/g)) {
		const cls = tag[0].match(/class="([^"{]*)"/);
		if (!cls) continue;
		for (const c of cls[1].split(/\s+/)) if (c) out.add(c);
	}
	return [...out];
}

const files = svelteFiles('src').filter((f) => readFileSync(f, 'utf-8').includes('class:skeleton'));

describe('nothing may reset the skeleton gradient out from under it', () => {
	it('finds the components that use it at all', () => {
		// If this drops to zero the rest of the file is vacuously green.
		expect(files.length).toBeGreaterThan(0);
	});

	for (const file of files) {
		const src = readFileSync(file, 'utf-8');
		const style = src.slice(src.indexOf('<style>'));

		for (const companion of skeletonCompanions(src)) {
			it(`${file}: .${companion} does not set a bare \`background\` shorthand`, () => {
				// A rule for exactly `.<companion>` (no `:not(.skeleton)`, no
				// second class) that sets the `background` SHORTHAND. Longhands
				// (background-color, background-image) are fine — they do not
				// reset the other two.
				const rule = new RegExp(`\\.${companion}\\s*\\{[^}]*\\}`, 'g');
				for (const m of style.matchAll(rule)) {
					expect(m[0], `${file} — .${companion} must be \`.${companion}:not(.skeleton)\``).not.toMatch(
						/[^-]background\s*:/
					);
				}
			});
		}
	}
});
