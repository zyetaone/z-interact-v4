import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	timeout: 10 * 60 * 1000,
	expect: { timeout: 15_000 },
	fullyParallel: false,
	retries: 0,
	workers: 1,
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL: 'http://localhost:5173',
		screenshot: 'off', // we take our own named screenshots
		video: 'retain-on-failure',
		trace: 'retain-on-failure',
		viewport: { width: 390, height: 844 }
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }],
	/**
	 * The projector captures need a server of their OWN.
	 *
	 * First attempt used port 5173 with `reuseExistingServer`, and silently
	 * photographed a dev server belonging to a different worktree of this
	 * same repo — the captures came back showing code this branch does not
	 * contain. `strictPort` on a port nothing else uses, and no reuse, so a
	 * capture can only ever be of the checkout it was run from.
	 *
	 * The phone specs keep their own hand-started server on 5173 (the global
	 * `baseURL`); this spec sets its own with `test.use`.
	 */
	webServer: {
		command: 'npm run dev -- --port 5273 --strictPort',
		url: 'http://localhost:5273/projector?fixtures=1&beat=lobby',
		reuseExistingServer: false,
		timeout: 120_000
	}
});
