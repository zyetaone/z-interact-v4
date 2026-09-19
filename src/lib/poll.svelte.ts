/**
 * THE POLL, and the staleness it reports.
 *
 * Ported verbatim from z-presence's `poll.svelte.ts`. A poll that fails
 * silently leaves the last good snapshot on the screen forever — the laptop
 * sleeps, the wifi drops — and a stale number is indistinguishable from a
 * true one. So the last successful read is kept and the caller draws a
 * banner off it.
 *
 * The rule is THREE MISSED READS. `refresh` is supplied rather than
 * imported, so nothing in here knows about remote functions — and the
 * failure is swallowed on purpose. The banner is the report; a throw would
 * take the beat down with it.
 */
export function poll(intervalMs: number, refresh: () => Promise<unknown>) {
	let lastOk = $state(Date.now());
	let now = $state(Date.now());
	const staleSeconds = $derived(Math.round((now - lastOk) / 1000));
	// `>=`, not `>` — see z-presence's comment: with `>`, the third missed
	// read lands exactly on the threshold and the banner waits for a fourth.
	const stale = $derived(staleSeconds >= (intervalMs * 3) / 1000);

	$effect(() => {
		let flying = false;
		const t = setInterval(async () => {
			if (flying) return;
			flying = true;
			now = Date.now();
			try {
				await refresh();
				lastOk = Date.now();
			} catch {
				// left stale on purpose — the banner is the report
			} finally {
				flying = false;
			}
		}, intervalMs);
		return () => clearInterval(t);
	});

	return {
		get staleSeconds() {
			return staleSeconds;
		},
		get stale() {
			return stale;
		}
	};
}
