import adapter from '@sveltejs/adapter-cloudflare';

/**
 * Cloudflare Pages via adapter-cloudflare, not adapter-auto. `platformProxy`
 * emulates `platform.env` (D1/R2 bindings) in `vite dev` from this project's
 * own `wrangler.jsonc` — ported pattern from z-presence.
 *
 * Remote functions are experimental (SvelteKit 2.27+) and are opted into
 * here, not in vite.config.ts — the vite plugin reads adapter/compilerOptions,
 * but `kit.experimental` is only picked up from this file.
 *
 * @type {import('@sveltejs/kit').Config}
 */
const config = {
	kit: {
		adapter: adapter({
			platformProxy: {
				configPath: 'wrangler.jsonc'
			}
		}),
		experimental: { remoteFunctions: true }
	},
	compilerOptions: {
		experimental: { async: true },
		runes: true
	}
};

export default config;
