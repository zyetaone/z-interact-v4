#!/usr/bin/env node
/**
 * GEN-VISUALS — generates one lens image per future (src/lib/game/futures.ts)
 * and one option image per non-open, non-wildcard option (src/lib/game/questions.ts),
 * via fal's nano-banana-2 queue API (same model + endpoint shape as
 * src/lib/server/fal.ts: submit -> poll status -> fetch result).
 *
 * Idempotent: any output file that already exists on disk is skipped, so a
 * partial run (budget cutoff, a flaky call) can be safely re-run.
 *
 * FAL_KEY is read from a .dev.vars file (path given by --keyfile, default
 * the sibling _deploy checkout) with a two-line reader — no dotenv
 * dependency, no logging of the key at any point.
 *
 * Usage:
 *   node scripts/gen-visuals.mjs [--only=lens|opt] [--limit=N] [--dry-run]
 */
import { register } from 'node:module';
import { writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
register('./ts-ext-loader.mjs', import.meta.url);

const ROOT = join(__dirname, '..');
const KEYFILE =
	process.env.FAL_KEYFILE ?? '/Users/rick.d/Developer/zyetaone/_deploy/z-interact-v4/.dev.vars';

/** Two-line .env-style reader: just enough to pull FAL_KEY=... out of a
 *  dotenv-shaped file. Never prints the value, never keeps it beyond the
 *  process env for this run. */
function readFalKey(path) {
	const line = readFileSync(path, 'utf8')
		.split('\n')
		.find((l) => l.startsWith('FAL_KEY='));
	if (!line) throw new Error(`FAL_KEY not found in ${path}`);
	return line.slice('FAL_KEY='.length).trim();
}

const FAL_KEY = readFalKey(KEYFILE);
const MODEL = 'fal-ai/nano-banana-2';
const QUEUE_URL = `https://queue.fal.run/${MODEL}`;

const args = new Map(
	process.argv.slice(2).map((a) => {
		const [k, v] = a.replace(/^--/, '').split('=');
		return [k, v ?? true];
	})
);
const ONLY = args.get('only'); // 'lens' | 'opt' | undefined
const LIMIT = args.get('limit') ? Number(args.get('limit')) : Infinity;
const DRY_RUN = Boolean(args.get('dry-run'));
const BUDGET = 70;

const { FUTURES, HOUSE_NEGATIVE } = await import('../src/lib/game/futures.ts');
const { QUESTIONS } = await import('../src/lib/game/questions.ts');

// --- job list ----------------------------------------------------------------

/** One `[key, promptFragment, negative]` job per future's cues, written per
 *  futures.md §2's per-future evidence (five cues each, folded into the
 *  moodLine already in futures.ts — see the report for the cue list). */
function lensJobs() {
	return FUTURES.map((f) => ({
		kind: 'lens',
		outPath: join(ROOT, 'static/visuals/lens', `${f.key}.jpg`),
		prompt: `A workplace of 2035 in its city, seen through the lens of ${f.name}: ${f.moodLine} Avoid: ${f.negativeFragment}, ${HOUSE_NEGATIVE}.`,
		aspect_ratio: '4:3',
		resolution: '1K'
	}));
}

function optionJobs() {
	const jobs = [];
	for (const q of QUESTIONS) {
		for (const o of q.options) {
			if (o.open) continue; // free-text options: no fixed visual to render
			jobs.push({
				kind: 'opt',
				outPath: join(ROOT, 'static/visuals/opt', `${q.id}-${o.key}.jpg`),
				prompt: `A single architectural detail, close, moody, photoreal: ${o.promptFragment}. Avoid: ${HOUSE_NEGATIVE}.`,
				aspect_ratio: '1:1',
				resolution: '0.5K'
			});
		}
	}
	return jobs;
}

let jobs = [...(ONLY === 'opt' ? [] : lensJobs()), ...(ONLY === 'lens' ? [] : optionJobs())];
jobs = jobs.filter((j) => !existsSync(j.outPath));
if (jobs.length > BUDGET) {
	console.log(`${jobs.length} pending jobs exceeds budget of ${BUDGET}; trimming to ${BUDGET}.`);
	jobs = jobs.slice(0, BUDGET);
}
jobs = jobs.slice(0, LIMIT);

console.log(`${jobs.length} image(s) to generate (skipping files that already exist).`);
if (DRY_RUN) {
	for (const j of jobs) console.log(`[dry-run] ${j.kind} -> ${j.outPath}`);
	process.exit(0);
}

// --- fal queue calls -----------------------------------------------------------

async function submit(job) {
	const res = await fetch(QUEUE_URL, {
		method: 'POST',
		headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({
			prompt: job.prompt,
			aspect_ratio: job.aspect_ratio,
			resolution: job.resolution,
			output_format: 'jpeg',
			num_images: 1
		})
	});
	if (!res.ok) throw new Error(`submit ${res.status}: ${await res.text().catch(() => '')}`);
	const body = await res.json();
	return body.request_id;
}

async function pollUntilDone(requestId, { intervalMs = 3000, timeoutMs = 180_000 } = {}) {
	const start = Date.now();
	for (;;) {
		const res = await fetch(`${QUEUE_URL}/requests/${requestId}/status`, {
			headers: { Authorization: `Key ${FAL_KEY}` }
		});
		if (!res.ok) throw new Error(`status ${res.status}: ${await res.text().catch(() => '')}`);
		const body = await res.json();
		if (body.status === 'COMPLETED') return;
		if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting on ${requestId}`);
		await new Promise((r) => setTimeout(r, intervalMs));
	}
}

async function fetchResult(requestId) {
	const res = await fetch(`${QUEUE_URL}/requests/${requestId}`, {
		headers: { Authorization: `Key ${FAL_KEY}` }
	});
	if (!res.ok) throw new Error(`result ${res.status}: ${await res.text().catch(() => '')}`);
	const body = await res.json();
	const url = body.images?.[0]?.url;
	if (!url) throw new Error('no image in result');
	return url;
}

async function runJob(job) {
	const requestId = await submit(job);
	await pollUntilDone(requestId);
	const imageUrl = await fetchResult(requestId);
	const imgRes = await fetch(imageUrl);
	if (!imgRes.ok) throw new Error(`download ${imgRes.status}`);
	const buf = Buffer.from(await imgRes.arrayBuffer());
	await mkdir(dirname(job.outPath), { recursive: true });
	await writeFile(job.outPath, buf);
	return buf.length;
}

// --- run, with a two-strikes-and-stop rule per the task's error budget ------

let consecutiveErrors = 0;
let done = 0;
const oversized = [];

for (const job of jobs) {
	process.stdout.write(`${job.kind} ${job.outPath.replace(ROOT + '/', '')} ... `);
	try {
		const bytes = await runJob(job);
		consecutiveErrors = 0;
		done++;
		const kb = (bytes / 1024).toFixed(0);
		console.log(`ok (${kb} KB)`);
		const limitKb = job.kind === 'lens' ? 400 : 250;
		if (bytes / 1024 > limitKb) oversized.push({ path: job.outPath, kb });
	} catch (err) {
		consecutiveErrors++;
		console.log(`FAILED: ${err.message}`);
		if (consecutiveErrors >= 2) {
			console.error('Two consecutive failures — stopping per budget guard.');
			break;
		}
	}
}

console.log(`\nGenerated ${done}/${jobs.length} image(s).`);
if (oversized.length) {
	console.log('Over target size budget:');
	for (const o of oversized) console.log(`  ${o.path.replace(ROOT + '/', '')} — ${o.kb} KB`);
}
