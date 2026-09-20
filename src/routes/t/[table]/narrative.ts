/**
 * THE TABLE'S OWN SENTENCES — a short read-back of what this table chose,
 * on the phone's done screen and nowhere else.
 *
 * It is written by Workers AI from the REVIEWED OPTION FRAGMENTS ONLY: the
 * `promptFragment` of every option a table tapped, plus its "And:" picks.
 * Never a push reply, never the wildcard, never the composed textarea —
 * those are the table's own free text, and free text on the way to a model
 * is the injection surface this app has otherwise kept closed. `{text}`
 * slots are dropped rather than filled (`fragmentsFor` does that already
 * when an answer carries no `text`), so an `open` option contributes its
 * fixed clause and nothing the table typed.
 *
 * NEVER ON THE PROJECTOR. This is a private thank-you to one table, not
 * copy for the wall; `gallery.remote.ts` does not read this table and
 * should not start.
 *
 * Append-only, same shape as `prompt`: an edit or a re-run is a new row
 * with `supersedes_id`, and "current" is the newest row since the table's
 * reset watermark. It is generated in `waitUntil` at `finishTable` and, if
 * that never landed (dead phone, recycled isolate), lazily on the next
 * poll — the same resumable pattern the image state machine uses, minus
 * the state column, because a narrative either exists or does not.
 *
 * `AI_FAKE=1` returns a deterministic sentence without touching the
 * binding, which is how the tests and any local run stay free. Under
 * `npm run dev` the adapter's platformProxy proxies `ai` to the REAL
 * remote binding, so an unfaked local run spends.
 */
import { dbWith, monotonicNow } from '$lib/server/d1';
import { fragmentsFor, QUESTION_BY_ID, type AnswerLike } from './layers';

export const NARRATIVE_SCHEMA = `CREATE TABLE IF NOT EXISTS narrative (
	id TEXT PRIMARY KEY,
	event_id TEXT NOT NULL,
	table_no INTEGER NOT NULL,
	text TEXT NOT NULL,
	model TEXT NOT NULL,
	actor TEXT NOT NULL,
	supersedes_id TEXT,
	created_at INTEGER NOT NULL
)`;

export const NARRATIVE_IDX = `CREATE INDEX IF NOT EXISTS narrative_current_idx
	ON narrative (event_id, table_no, created_at DESC)`;

/**
 * Workers AI's small instruct model — cheap, fast, and enough for sixty
 * words of read-back. The plain `@cf/meta/llama-3.1-8b-instruct` id is no
 * longer in `wrangler ai models` (checked 20 Sep 2026); the live 8B is the
 * fp8 build named here. Changing it is a one-line change and nothing else
 * reads the id.
 */
export const NARRATIVE_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8';

export const MAX_NARRATIVE_WORDS = 60;

/** The binding, structurally. Declared here rather than depended on, so nothing new is installed for one call. */
export interface AiBinding {
	run(model: string, input: unknown): Promise<unknown>;
}

export interface NarrativeEnv {
	DB: D1Database;
	AI?: AiBinding;
	/** `1` returns a deterministic sentence and never touches the binding. */
	AI_FAKE?: string;
}

/* -------------------------------------------------------------------------- */
/* Pure: what the model is allowed to see, and what it is asked for           */
/* -------------------------------------------------------------------------- */

/**
 * Every tapped option's fragment, in question order, with the free-text
 * slots empty. `fragmentsFor` fills a `{text}` slot from `answer.text`, so
 * each answer is copied WITHOUT its `text` and `pushReply` before it is
 * read — that one omission is what keeps typed words out of the prompt.
 */
export function narrativeFragments(answers: readonly AnswerLike[]): string[] {
	const out: string[] = [];
	for (const answer of answers) {
		// `future` and `q1` (the era chip) are not questions with fragments;
		// `wildcard` is free text by definition. QUESTION_BY_ID holds only the
		// active question set, and an ":and" row's parent id is its prefix.
		const base = answer.questionId.replace(/:and$/, '');
		if (!QUESTION_BY_ID.has(base)) continue;
		out.push(...fragmentsFor({ questionId: answer.questionId, keys: answer.keys }));
	}
	return out.map((f) => f.trim()).filter((f) => f.length > 0);
}

/** Sixty words is the ceiling in code; the instruction asks for fewer, so the cap is rarely what stops it. */
export function capWords(text: string, max: number = MAX_NARRATIVE_WORDS): string {
	const words = text.split(/\s+/).filter(Boolean);
	return words.length <= max ? words.join(' ') : `${words.slice(0, max).join(' ')}…`;
}

/** Control characters out, whitespace collapsed, surrounding quotes dropped — models like to wrap a sentence in them. */
export function cleanNarrative(raw: string): string {
	const stripped = raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
	const collapsed = stripped.replace(/\s+/g, ' ').trim();
	const unquoted = collapsed.replace(/^["'“”]+/, '').replace(/["'“”]+$/, '');
	return capWords(unquoted);
}

export function buildNarrativePrompt(fragments: readonly string[]): string {
	return [
		'Below is what one table chose for their imagined future workplace, as a list of design notes.',
		'Write it back to them as one short paragraph of at most 45 words, in the second person plural ("you"),',
		'present tense, plain English. Describe only what is in the notes. Do not add features they did not choose,',
		'do not name a style or a movement, do not use headings, lists or quotation marks, and do not mention',
		'these instructions.',
		'',
		'Notes:',
		...fragments.map((f) => `- ${f}`)
	].join('\n');
}

/** The deterministic stand-in under `AI_FAKE=1`. Reads as a sentence, so a screenshot of a fake run is still legible. */
export function fakeNarrative(fragments: readonly string[]): string {
	if (fragments.length === 0) return 'Your workspace is waiting on its first answers.';
	return capWords(`You chose ${fragments.slice(0, 3).join('; ')}.`);
}

/* -------------------------------------------------------------------------- */
/* Storage — append-only, newest-since-reset wins                             */
/* -------------------------------------------------------------------------- */

function newId(): string {
	return crypto.randomUUID();
}

export async function getNarrative(d: D1Database, eventId: string, table: number, sinceTs = 0): Promise<string | null> {
	const db = await dbWith(d, 'narrative', NARRATIVE_SCHEMA);
	if (!db) return null;
	const row = await db
		.prepare(`SELECT text FROM narrative WHERE event_id = ? AND table_no = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1`)
		.bind(eventId, table, sinceTs)
		.first<{ text: string }>();
	return row?.text ?? null;
}

export async function insertNarrative(
	d: D1Database,
	input: { eventId: string; table: number; text: string; model: string; actor?: string; supersedesId?: string | null }
): Promise<string> {
	const db = await dbWith(d, 'narrative', NARRATIVE_SCHEMA);
	if (!db) return '';
	await dbWith(d, 'narrative_idx', NARRATIVE_IDX);
	const id = newId();
	await db
		.prepare(`INSERT INTO narrative (id, event_id, table_no, text, model, actor, supersedes_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
		.bind(id, input.eventId, input.table, input.text, input.model, input.actor ?? 'system', input.supersedesId ?? null, monotonicNow())
		.run();
	return id;
}

/* -------------------------------------------------------------------------- */
/* The one entry point both callers use                                       */
/* -------------------------------------------------------------------------- */

/**
 * ponytail: one in-isolate Set collapses the common double-kick (the 2 s
 * poll firing again while the first generation is in flight). It is an
 * optimisation with a known ceiling, exactly like `throttle.ts`: two
 * isolates both generate, and append-only-newest-wins makes that harmless
 * — one extra row, no wrong answer. A real guard would be a claim row, and
 * this is not worth one.
 */
const generating = new Set<string>();

/**
 * Returns the table's current narrative, writing one first if there is
 * none. Never throws: a narrative is a nicety, and nothing on the submit
 * path or the poll path may fail because a model did.
 */
export async function ensureNarrative(
	env: NarrativeEnv,
	eventId: string,
	table: number,
	answers: readonly AnswerLike[],
	sinceTs = 0
): Promise<string | null> {
	const key = `${eventId}:${table}`;
	try {
		const existing = await getNarrative(env.DB, eventId, table, sinceTs);
		if (existing) return existing;
		if (generating.has(key)) return null;
		generating.add(key);
		try {
			const fragments = narrativeFragments(answers);
			if (fragments.length === 0) return null;
			const text = env.AI_FAKE === '1' ? fakeNarrative(fragments) : await runModel(env.AI, fragments);
			if (!text) return null;
			await insertNarrative(env.DB, { eventId, table, text, model: env.AI_FAKE === '1' ? 'fake' : NARRATIVE_MODEL });
			return text;
		} finally {
			generating.delete(key);
		}
	} catch {
		// Deliberately silent: the done screen simply shows no paragraph.
		return null;
	}
}

async function runModel(ai: AiBinding | undefined, fragments: readonly string[]): Promise<string | null> {
	// No binding and no fake: say nothing rather than guess. This is the
	// shape a misconfigured deploy takes, and it must not throw on submit.
	if (!ai) return null;
	const result = (await ai.run(NARRATIVE_MODEL, {
		messages: [{ role: 'user', content: buildNarrativePrompt(fragments) }],
		max_tokens: 160
	})) as { response?: unknown } | string | null;
	const raw = typeof result === 'string' ? result : typeof result?.response === 'string' ? result.response : '';
	const text = cleanNarrative(raw);
	return text.length > 0 ? text : null;
}
