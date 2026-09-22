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
 *   node scripts/flow-reset.mjs [table]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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

execFileSync('npx', ['wrangler', 'd1', 'execute', 'z-interact-v4-db', '--local', '--command', sql], {
	stdio: 'inherit'
});
console.log(`table ${table} cleared in the local D1 (event ${eventId})`);
