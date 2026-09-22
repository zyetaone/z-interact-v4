/**
 * EVERY CLASS IN THE MARKUP MUST RESOLVE TO A RULE.
 *
 * This has now bitten three times in one week, each time invisibly:
 *
 *  1. `/admin/photos` shipped with no `app.css` import and served in Times
 *     New Roman on white. Nothing failed.
 *  2. `.danger` on the desk was eaten by a more specific
 *     `.admin-root button.danger-outline`. Found in a screenshot.
 *  3. `class="clear-confirm"` — the Clear all confirmation field — was
 *     written with no rule behind it at all, so it inherited the desk's
 *     near-white ink over a light UA background and printed white on
 *     white. On the one control in this app that cannot be undone: the
 *     facilitator is asked to type the event id and cannot see what they
 *     are typing.
 *
 * A missing style is not a build error, not a type error and not a check
 * warning. Svelte does warn about the reverse (a RULE with no element) and
 * says nothing about this direction, which is the one that reaches a user.
 *
 * So: static, no browser, no snapshot. Read every component, collect the
 * classes its markup uses, and require each to appear in that component's
 * own <style> or in the global `app.css`.
 *
 * Deliberately NOT asserted: that the rule is correct, or that it wins its
 * specificity fight. That is failure 2 above and this test would not have
 * caught it. It catches failure 3, which is the cheaper and more common
 * one — a name nobody ever wrote a rule for.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';

function svelteFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) return svelteFiles(full);
		return full.endsWith('.svelte') ? [full] : [];
	});
}

const classesIn = (css: string) => new Set(css.match(/\.[A-Za-z][A-Za-z0-9_-]*/g)?.map((c) => c.slice(1)) ?? []);

/** Global classes every component may use without declaring them. */
const GLOBAL = classesIn(readFileSync(join(SRC, 'app.css'), 'utf-8'));

/** Classes the markup asks for. Dynamic expressions are skipped — a `class={...}` we cannot read statically is not evidence of a missing rule. */
function usedClasses(markup: string): string[] {
	const out = new Set<string>();
	for (const m of markup.matchAll(/class="([^"]*)"/g)) {
		for (const raw of m[1].split(/[\s{}]+/)) {
			const c = raw.trim();
			if (c && !/[$()?:|&=<>.]/.test(c)) out.add(c);
		}
	}
	for (const m of markup.matchAll(/class:([A-Za-z0-9_-]+)/g)) out.add(m[1]);
	return [...out];
}

describe('every class hook has a rule behind it', () => {
	const files = svelteFiles(SRC);

	it('finds the components at all — a passing empty sweep proves nothing', () => {
		expect(files.length).toBeGreaterThan(15);
	});

	it.each(files)('%s', (file) => {
		const src = readFileSync(file, 'utf-8');
		const at = src.indexOf('<style>');
		const markup = at > 0 ? src.slice(0, at) : src;
		const own = at > 0 ? classesIn(src.slice(at)) : new Set<string>();

		const orphans = usedClasses(markup).filter((c) => !own.has(c) && !GLOBAL.has(c));
		expect(orphans, `class(es) used in ${file} with no rule in its <style> or app.css`).toEqual([]);
	});
});
