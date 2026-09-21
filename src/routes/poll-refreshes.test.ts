import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * THE BUG THIS EXISTS FOR, measured against production 21 Sep.
 *
 * A SvelteKit remote `query()` caches by (function, serialised args). So a
 * poll callback whose body is `room = await getRoom()` fetches once, on the
 * first tick, and every later tick resolves the SAME cached promise without
 * touching the network. The screen freezes on its first paint.
 *
 * It cannot be caught by watching for errors, which is what made it so
 * dangerous: the cached call RESOLVES, so the staleness banner never fires
 * and the wall reports healthy while showing three-hour-old content. The
 * beat was changed on the server and sixteen seconds later the projector
 * had made zero network calls and still read "lobby"; a reload showed the
 * new beat at once.
 *
 * `.refresh()` is what actually goes to the network. This test reads the
 * three polling screens and fails if any poll body awaits a query without
 * refreshing it first.
 */
const POLLING_SCREENS = [
	'src/routes/projector/+page.svelte',
	'src/routes/admin/+page.svelte',
	'src/routes/t/[table]/+page.svelte'
];

/**
 * Comments are stripped FIRST, and that is not a detail. The first version
 * of this test passed against the reintroduced bug, because the comment
 * explaining why `.refresh()` is needed contains the string `.refresh()`.
 * A guard satisfied by its own prose is not a guard.
 */
function stripComments(src: string): string {
	return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** The body of every `poll(...)` callback in a file, plus any `refresh()` helper. */
function pollBodies(raw: string): string[] {
	const src = stripComments(raw);
	const out: string[] = [];
	for (const marker of ['poll(', 'async function refresh(']) {
		let i = src.indexOf(marker);
		while (i !== -1) {
			out.push(src.slice(i, i + 900));
			i = src.indexOf(marker, i + 1);
		}
	}
	return out;
}

describe('a poll that does not refresh is not a poll', () => {
	for (const rel of POLLING_SCREENS) {
		it(`${rel} refreshes every query it polls`, () => {
			const src = readFileSync(join(process.cwd(), rel), 'utf8');
			const bodies = pollBodies(src);
			expect(bodies.length, 'found no poll or refresh body to check').toBeGreaterThan(0);
			for (const body of bodies) {
				// Only bodies that actually read a room/status query are in scope.
				if (!/await\s+q\b|await\s+\w*[Rr]oom\(|await\s+tableStatus\(/.test(body)) continue;
				expect(body, `${rel}: a polled query is awaited without .refresh()`).toContain(
					'.refresh()'
				);
			}
		});
	}
});
