// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Env } from '$lib/server/env';

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env: Env;
			context: ExecutionContext;
			caches: CacheStorage & { default: Cache };
		}
	}
}

export {};
