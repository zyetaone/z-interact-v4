#!/usr/bin/env node
/**
 * Drops ONE table's rows from the LOCAL D1, so `flow-book.spec.ts` can walk
 * the flow from the landing screen again.
 *
 * Local D1 persists between `npm run dev` runs. The capture spec therefore
 * passes once and then lands on the done screen for ever, where it waited
 * three minutes for a Start button that was not there.
 *
 * This is a hard DELETE, which the app itself never does — the desk's reset
 * is a watermark, because an event's rows are the record. That rule is about
 * the event; this is a dev fixture on a local file, and a watermark would
 * leave the capture reading rows it is meant to be creating.
 *
 * RUN IT WITH THE DEV SERVER STOPPED, or accept intermittent 500s.
 *
 * `wrangler d1 execute --local` starts its OWN miniflare against the same
 * SQLite file `npm run dev` already has open, and a write from one while the
 * other is serving makes D1 reads fail from inside miniflare:
 *
 *   D1_ERROR: Failed to parse body as JSON, got: Error: internal error
 *
 * Measured 22 Sep: 1 request in 30 failed that way during two resets, from
 * `getCurrentImage` and `getLatestPrompt` — two innocent reads, with nothing
 * in the app's own code at fault. It clears on its own, which is exactly
 * what makes it worth a warning: the symptom looks like a database bug and
 * is a second process.
 *
 * LOCAL ONLY. Production D1 is a Cloudflare service, not a file two
 * processes can open, so none of this reaches a deployed event.
 *
 *   node scripts/flow-reset.mjs [table]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createConnection } from 'node:net';

const table = Number(process.argv[2] ?? 4);
if (!Number.isInteger(table) || table < 1) throw new Error(`bad table: ${process.argv[2]}`);

const eventId = (readFileSync('.dev.vars', 'utf-8').match(/^EVENT_ID=(.*)$/m)?.[1] ?? '').trim();
if (!eventId) throw new Error('EVENT_ID is not set in .dev.vars');

const sql = [
	`DELETE FROM answer WHERE event_id = '${eventId}' AND table_no = ${table};`,
	`DELETE FROM prompt WHERE event_id = '${eventId}' AND table_no = ${table};`,
	`DELETE FROM image WHERE event_id = '${eventId}' AND table_no = ${table};`,
	`DELETE FROM narrative WHERE event_id = '${eventId}' AND table_no = ${table};`,
	`DELETE FROM table_reset WHERE event_id = '${eventId}' AND table_no = ${table};`,
	`UPDATE event_table SET submitted_at = NULL WHERE event_id = '${eventId}' AND table_no = ${table};`
].join(' ');

/** True if something is listening on the dev port — i.e. `npm run dev` is up. */
async function devServerUp(port = 5173) {
	return new Promise((resolve) => {
		// 'localhost', NOT '127.0.0.1'. Vite listens on [::1] only, so probing
		// the IPv4 loopback reports the server as down while it is serving —
		// which is the exact false negative this warning exists to avoid.
		const sock = createConnection({ port, host: 'localhost' });
		const done = (up) => {
			sock.destroy();
			resolve(up);
		};
		sock.setTimeout(400);
		sock.once('connect', () => done(true));
		sock.once('timeout', () => done(false));
		sock.once('error', () => done(false));
	});
}

if (await devServerUp()) {
	console.warn(
		'\n  WARNING: the dev server is running on 5173.\n' +
			'  This writes to the same local SQLite file through a second miniflare,\n' +
			"  and the server's D1 reads can fail while it does:\n" +
			'      D1_ERROR: Failed to parse body as JSON, got: Error: internal error\n' +
			'  Those 500s are this script, not the app, and they clear on their own.\n' +
			'  Stop the dev server first to avoid them entirely.\n'
	);
}

execFileSync('npx', ['wrangler', 'd1', 'execute', 'z-interact-v4-db', '--local', '--command', sql], {
	stdio: 'inherit'
});
console.log(`table ${table} cleared in the local D1 (event ${eventId})`);
