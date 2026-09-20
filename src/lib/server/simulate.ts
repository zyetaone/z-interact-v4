/**
 * THE REHEARSAL DRIVER — twenty coherent tables, without twenty phones.
 *
 * game-flow.md §8: "a simulator route drives 20 tables concurrently against
 * the built app, then reads the room back and asserts it agrees. Run it
 * before the site-tech window, not during."
 *
 * Everything here is PURE: which future a table argues from, which options
 * it picks, what it types. The route (`routes/simulate/+server.ts`) takes
 * this plan and feeds it through the REAL remote-function commands, so a
 * rehearsal exercises the same gate, the same throttle, the same caps and
 * the same prompt composition a phone would. A simulator with its own
 * write path proves only that the simulator works.
 *
 * The randomness is SEEDED. A rehearsal that cannot be repeated cannot be
 * used to confirm a fix, and "it worked the second time" is not an answer.
 */
import { ACTIVE_QUESTIONS, WILDCARD, andId, type Question } from '$lib/game/questions';
import { FUTURES } from '$lib/game/futures';
import { allowedEras, type Era } from '$lib/game/era';

/** Small deterministic PRNG (mulberry32) — no dependency, same sequence for the same seed. */
export function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function pick<T>(next: () => number, from: readonly T[]): T {
	return from[Math.floor(next() * from.length) % from.length];
}

function pickSome<T>(next: () => number, from: readonly T[], n: number): T[] {
	const pool = [...from];
	const out: T[] = [];
	for (let i = 0; i < n && pool.length; i++) {
		out.push(pool.splice(Math.floor(next() * pool.length) % pool.length, 1)[0]);
	}
	return out;
}

/**
 * Filler for an `open` option's typed field, and for the push replies.
 * Deliberately generic architectural phrases — a rehearsal must never put a
 * colleague's, a client's or an event's name into a prompt or onto the wall.
 */
const FILLER = [
	'the long table by the window',
	'a stair people actually stop on',
	'the quiet room nobody books',
	'daylight from two sides',
	'the corner that holds the plants',
	'a floor you can move in a morning',
	'the wall we write on',
	'somewhere to put a coat down'
] as const;

export interface PlannedAnswer {
	questionId: string;
	keys: string[];
	text?: Record<string, string>;
	pushReply?: string;
}

export interface PlannedTable {
	table: number;
	futureKey: string;
	era: Era;
	answers: PlannedAnswer[];
	wildcard: string | null;
}

/** How many keys this question wants, honouring its own `select` rule rather than always picking one. */
function keysFor(next: () => number, q: Question): string[] {
	const options = q.options.map((o) => o.key);
	switch (q.select.kind) {
		case 'pick':
			return pickSome(next, options, Math.min(q.select.n, options.length));
		case 'many': {
			const min = q.select.min ?? 1;
			const n = Math.max(min, 1 + Math.floor(next() * Math.min(3, options.length)));
			return pickSome(next, options, Math.min(n, options.length));
		}
		default:
			return [pick(next, options)];
	}
}

/**
 * One table's whole run. The era is drawn from the future's OWN allowed
 * set, so the plan never proposes a combination `saveEra` would refuse —
 * a simulator whose answers bounce off a real rule is testing nothing.
 */
export function planTable(table: number, seed: number): PlannedTable {
	const next = rng(seed + table * 7919);
	const future = pick(next, FUTURES);
	const eras = allowedEras(future);
	const era = (eras.length ? pick(next, eras) : future.eraDefault) as Era;

	const answers: PlannedAnswer[] = [];
	// The era chip is written by saveEra, never as a planned answer; V4's
	// QUESTIONS opens at q2 so nothing here needs skipping.
	for (const q of ACTIVE_QUESTIONS) {
		const keys = keysFor(next, q);
		const text: Record<string, string> = {};
		for (const key of keys) {
			const option = q.options.find((o) => o.key === key);
			if (option?.open) text[key] = pick(next, FILLER);
		}
		answers.push({
			questionId: q.id,
			keys,
			text: Object.keys(text).length ? text : undefined,
			// Only the ◆ questions capture a typed push reply; the rest are spoken.
			pushReply: q.pushCapturesReply && next() > 0.35 ? pick(next, FILLER) : undefined
		});
		// V4's "And:" sub-question is optional on the phone, so most tables
		// pick one and some leave it — its row goes through the same saveAnswer.
		if (q.and && next() > 0.25) {
			answers.push({ questionId: andId(q.id), keys: [pick(next, q.and.options.map((o) => o.key))] });
		}
	}

	return {
		table,
		futureKey: future.key,
		era,
		answers,
		// The wildcard is optional in the real flow, so some tables skip it.
		wildcard: next() > 0.4 ? pick(next, FILLER).slice(0, 140) : null
	};
}

export function planRoom(tables: number, seed: number): PlannedTable[] {
	return Array.from({ length: tables }, (_, i) => planTable(i + 1, seed));
}

export { WILDCARD };
