/**
 * WALL CAPTURES — the projector's five beats at both wall sizes, from
 * `?fixtures=1` only. No D1, no R2, no fal, no spend: the fixture room is
 * twenty fake tables whose tiles are the seven real lens JPEGs in
 * `static/visuals/lens/`, so what lands in `docs/screens/` is what the
 * venue will actually show.
 *
 * Two sizes, because the venue has two kinds of surface:
 *   5760x1080 — the LED wall, ~5.3:1, three 16:9 panels wide
 *   1920x1080 — the two small wall TVs, and every rehearsal laptop
 *
 * Run it alone. The other specs in this directory drive REAL fal renders:
 *   npx playwright test tests/e2e/projector-screens.spec.ts
 */
import { expect, test } from '@playwright/test';
import { ZONES } from '../../src/lib/game/zones';

// Its own server, never the shared 5173 — see playwright.config.ts.
test.use({ baseURL: 'http://localhost:5273' });

const WALL = { width: 5760, height: 1080 };
const TV = { width: 1920, height: 1080 };

/** The five beats, and the query that pins each one without a desk. */
const BEATS = [
	{ name: 'lobby', query: 'beat=lobby' },
	{ name: 'progress', query: 'beat=progress' },
	{ name: 'reveal', query: 'beat=reveal' },
	// Table 8 is `done` in the fixture cycle, so focus has all four zones.
	{ name: 'focus', query: 'beat=focus&table=8' },
	{ name: 'finale', query: 'beat=finale' }
] as const;

async function capture(page: import('@playwright/test').Page, url: string, file: string) {
	await page.goto(url);
	// The wall is a still photograph of a moving screen: freeze the motion so
	// a re-run produces a comparable image rather than a different frame.
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.waitForLoadState('networkidle');
	// Every tile is a real JPEG; a capture taken before they decode shows the
	// empty-cell treatment and reads as a layout bug that is not there.
	await page.waitForFunction(() => {
		const imgs = [...document.querySelectorAll('img')];
		return imgs.every((i) => i.complete && i.naturalWidth > 0);
	});
	// JPEG, not PNG. These are photographs of photographs: the same twelve
	// captures as PNG came to 54 MB, which is not a thing to put in a git
	// repository for the sake of a review still. Quality 88 is visually
	// identical at the sizes anyone will read them and about a tenth the
	// bytes. Change `type` here if a lossless capture is ever needed.
	await page.screenshot({ path: `docs/screens/${file}.jpg`, type: 'jpeg', quality: 88, fullPage: false });
}

test.describe('projector wall captures', () => {
	for (const beat of BEATS) {
		test(`${beat.name} at 5760x1080 and 1920x1080`, async ({ page }) => {
			await page.setViewportSize(WALL);
			await capture(page, `/projector?fixtures=1&${beat.query}`, `projector-${beat.name}-5760x1080`);

			await page.setViewportSize(TV);
			await capture(page, `/projector?fixtures=1&${beat.query}`, `projector-${beat.name}-1920x1080`);
		});
	}

	test('the aspect override forces either layout at either size', async ({ page }) => {
		await page.setViewportSize(TV);
		await capture(page, '/projector?fixtures=1&beat=reveal&aspect=wide', 'projector-reveal-1920x1080-forced-wide');

		await page.setViewportSize(WALL);
		await capture(page, '/projector?fixtures=1&beat=reveal&aspect=16x9', 'projector-reveal-5760x1080-forced-16x9');
	});

	test('a reveal tile is a picture, not a strip', async ({ page }) => {
		// Live at 1920x1080 the old grid collapsed each tile's image to about
		// 25px of the frame with empty navy beneath it. The paged layout sizes
		// tiles from the grid rather than from the number of tables, so the
		// bug cannot come back with more data — this measures it anyway,
		// because that is the assertion, not the reasoning.
		for (const size of [WALL, TV]) {
			await page.setViewportSize(size);
			await page.goto('/projector?fixtures=1&beat=reveal');
			await page.waitForLoadState('networkidle');
			const boxes = await page.locator('figure img').evaluateAll((els) =>
				els.map((e) => e.getBoundingClientRect().height)
			);
			expect(boxes.length).toBeGreaterThan(0);
			for (const h of boxes) expect(h).toBeGreaterThan(size.height * 0.3);
		}
	});

	test('the room ledger is its own surface, not a shrunken wall', async ({ page }) => {
		// The two ceiling televisions. Captured at 1920x1080 only: they are
		// 16:9 panels, and the point of the surface is that it does NOT
		// follow the wall's shape.
		await page.setViewportSize(TV);
		await capture(page, '/projector?fixtures=1&surface=ledger&beat=progress', 'projector-ledger-1920x1080');
	});

	test('no beat prints a future name, at either size', async ({ page }) => {
		// The reason the captures exist: the live reveal was printing
		// "GARDEN CITY 2" as a group header. Names are read off the real
		// futures list, so a rename cannot make this check pass by accident.
		const { FUTURES } = await import('../../src/lib/game/futures');
		for (const size of [WALL, TV]) {
			await page.setViewportSize(size);
			for (const beat of BEATS) {
				await page.goto(`/projector?fixtures=1&${beat.query}`);
				const text = (await page.locator('body').innerText()).toLowerCase();
				for (const f of FUTURES) {
					expect(text, `${beat.name} at ${size.width} names ${f.name}`).not.toContain(f.name.toLowerCase());
				}
				// Zone keys are internal vocabulary too, not wall copy.
				for (const z of ZONES) expect(text).not.toContain(`zone-${z.key}`);
			}
		}
	});
});
