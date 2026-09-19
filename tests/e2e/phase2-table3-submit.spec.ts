import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { TablePage } from './pages/table.page';

/**
 * Table 3 only, submit step. Deliberately does not wait on this page's own
 * poll for completion — see REPORT.md's finding that a long-lived page can
 * silently stop transitioning Drawing -> Images despite the poll ticking.
 * Completion is confirmed out-of-band via D1 (rescue-check/rescue-screenshot).
 */
test('table 3 — submit', async ({ page }) => {
	const dir = 'docs/fidelity/table-3';
	mkdirSync(dir, { recursive: true });
	const t = new TablePage(page);

	await t.goto(3);
	await expect(t.heading).toContainText('Read it back', { timeout: 15_000 });
	const composed = await t.readComposedPrompt();
	writeFileSync(`${dir}/prompt.txt`, composed, 'utf8');

	await t.submit();
	await expect(t.heading).toContainText('Being drawn', { timeout: 15_000 });
	await t.screenshot(dir, '17-drawing');
});
