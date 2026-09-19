import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { TablePage } from './pages/table.page';
import { ALL_TABLES } from './table-configs';

/**
 * Phase 2 — reloads each table (already answered by phase 1, same D1/EVENT_ID),
 * expects the review screen, submits (real fal credits spent here), then
 * polls the phone's own drawing/images screens until all four zone images
 * are stored or a 6-minute cap elapses. Downloads each stored image from the
 * app's own `/t/[table]/img/[id]` route.
 */
for (const table of ALL_TABLES) {
	test(`table ${table.table} — submit and generate`, async ({ page }) => {
		const dir = `docs/fidelity/table-${table.table}`;
		mkdirSync(dir, { recursive: true });
		const t = new TablePage(page);

		await t.goto(table.table);
		await expect(t.heading).toContainText('Read it back', { timeout: 15_000 });

		const composed = await t.readComposedPrompt();
		writeFileSync(`${dir}/prompt.txt`, composed, 'utf8'); // overwrite with the review-time value, should match phase 1

		const t0 = Date.now();
		await t.submit();

		await expect(t.heading).toContainText('Being drawn', { timeout: 15_000 });
		await t.screenshot(dir, '17-drawing');

		const states = await t.waitForAllImages(6 * 60 * 1000);
		const elapsedMs = Date.now() - t0;
		writeFileSync(`${dir}/timing.json`, JSON.stringify({ table: table.table, elapsedMs, states }, null, 2));

		// Whatever state we're in when the cap hits, capture it — a partial
		// or failed result is itself a finding, not just a passing run.
		await page.waitForTimeout(500);
		await t.screenshot(dir, '18-images-or-timeout');

		for (const s of states) {
			if (s.state === 'stored' || s.state === 'done') {
				const img = page.locator('.gallery li', { has: page.locator('.zone', { hasText: s.zoneKey }) }).locator('img');
				const src = await img.getAttribute('src');
				if (src) {
					const resp = await page.request.get(new URL(src, page.url()).toString());
					const buf = await resp.body();
					writeFileSync(`${dir}/zone-${s.zoneKey}.png`, buf);
				}
			}
		}

		// Don't hard-fail the suite on a generation failure — report it. The
		// assertion is soft so every table gets its own report entry even if
		// fal/the model rejects one of them.
		if (!(states.length === 4 && states.every((s) => s.state === 'stored' || s.state === 'done'))) {
			test.info().annotations.push({
				type: 'incomplete-generation',
				description: `table ${table.table}: ${JSON.stringify(states)}`
			});
		}
	});
}
