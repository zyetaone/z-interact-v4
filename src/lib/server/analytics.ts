/**
 * WHAT THE ROOM SAID, AND WHAT IT COST — the read-only summary behind
 * `/admin/analytics`.
 *
 * Pure, like `gate.ts`'s `decideSubmit` and `generate.ts`'s `tick`: it takes
 * the rows `exportRoomRows` already produces and returns numbers. No D1, no
 * env, no clock beyond the `now` handed to it — so every figure on the
 * screen is reproducible from an export taken at the same moment, and the
 * tests need no database.
 *
 * Three questions, which is exactly what was asked for:
 *   1. What did the room answer?   `questions`, `lenses`, `wildcards`
 *   2. Is the room moving?         `tables`, `totals`
 *   3. What is it costing?         `spend`
 *
 * WHY IT READS THE EXPORT RATHER THAN ITS OWN SQL: `exportRoomRows` already
 * resolves the two rules a hand-written `GROUP BY` gets wrong. `answer` is
 * append-only, so the newest row per (table, question) is the answer and
 * every earlier revision is not; and a table that was reset has a watermark,
 * so rows before it belong to a previous occupant of that table. Counting
 * raw `answer` rows would double-count every edit and resurrect every reset.
 *
 * ponytail: the export is ~10 queries per table, so this is ~200 for a
 * 20-table room — fine for a page a facilitator opens now and then, wrong
 * for a poll. If this ever needs to refresh on a timer, give it two flat
 * queries (all answers, all images) and apply the watermark in memory.
 */
import type { ExportTableRow } from './room';
import type { Question, WildcardQuestion } from '$lib/game/questions';
import type { Future } from '$lib/game/futures';

export interface OptionCount {
	key: string;
	label: string;
	count: number;
	/** Of the tables that answered this question, not of the room. 0 when nobody has. */
	share: number;
}

export interface QuestionBreakdown {
	questionId: string;
	prompt: string;
	/** How many tables have a current answer for it. */
	answered: number;
	options: OptionCount[];
	/** What tables typed, where an option or a push line captured text. */
	replies: { table: number; text: string }[];
}

export interface LensCount {
	key: string;
	name: string;
	count: number;
	tables: number[];
}

export interface TableLine {
	table: number;
	futureKey: string | null;
	/** Current answers held, against the number of questions in the set. */
	answered: number;
	submittedAt: number | null;
	/** Minutes from a table's first answer to its submit, null until it submits. */
	minutesToSubmit: number | null;
	stored: number;
	pending: number;
	failed: number;
	/** Every render this table has ever spent, including superseded ones. */
	renders: number;
	atCap: boolean;
}

export interface Totals {
	tables: number;
	started: number;
	submitted: number;
	stored: number;
	pending: number;
	failed: number;
}

export interface Spend {
	renders: number;
	cap: number;
	/** Tables that have spent their whole allowance and cannot draw again. */
	tablesAtCap: number[];
	/** Failure reasons, commonest first — the provider's own text, trimmed to its first line. */
	reasons: { reason: string; count: number }[];
}

export interface Analytics {
	generatedAt: number;
	totals: Totals;
	questions: QuestionBreakdown[];
	lenses: LensCount[];
	wildcards: { table: number; text: string }[];
	tables: TableLine[];
	spend: Spend;
}

export interface SummariseInput {
	rows: readonly ExportTableRow[];
	questions: readonly Question[];
	wildcard: WildcardQuestion;
	futures: readonly Future[];
	maxRenders: number;
	/**
	 * Renders spent per table, from `getRenderBudget` — the SAME counter
	 * `limits.ts` caps against, so the screen and the gate cannot disagree.
	 * It is not derivable from `rows`: the export carries only the current
	 * image per zone, and a superseded regeneration was still paid for.
	 * A table missing from the map falls back to what the export shows,
	 * which is a floor, never an overcount.
	 */
	rendersByTable?: ReadonlyMap<number, number>;
	now: number;
}

/** One question's answer for one table, or undefined — the export already resolved "current". */
function answerFor(row: ExportTableRow, questionId: string) {
	return row.answers.find((a) => a.questionId === questionId);
}

/**
 * Every piece of text a table typed against one question: the open option's
 * own reply first, then the push line's. Both are the table's words, and a
 * readout that shows one and hides the other is the readout losing half the
 * room's voice.
 */
function repliesFor(rows: readonly ExportTableRow[], questionId: string): { table: number; text: string }[] {
	const out: { table: number; text: string }[] = [];
	for (const row of rows) {
		const a = answerFor(row, questionId);
		if (!a) continue;
		for (const text of Object.values(a.text ?? {})) {
			const t = text.trim();
			if (t) out.push({ table: row.table, text: t });
		}
		const push = a.pushReply?.trim();
		if (push) out.push({ table: row.table, text: push });
	}
	return out;
}

function breakdown(rows: readonly ExportTableRow[], q: Question): QuestionBreakdown {
	const counts = new Map<string, number>();
	let answered = 0;
	for (const row of rows) {
		const a = answerFor(row, q.id);
		if (!a || a.keys.length === 0) continue;
		answered++;
		// A multi-select table counts once per key it picked, so the shares of
		// a multi-select question sum past 100 on purpose. `answered` is the
		// denominator either way: "of the tables that answered, this many
		// chose X" is the sentence a reader wants.
		for (const key of a.keys) counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	const options = q.options.map((o) => {
		const count = counts.get(o.key) ?? 0;
		return { key: o.key, label: o.label, count, share: answered === 0 ? 0 : count / answered };
	});
	// An option nobody picked still prints, at zero — the shape of what was
	// REFUSED is as much of a finding as what was chosen. Order by count so
	// the top of the list reads first, keeping the question's own order as
	// the tie-break rather than an arbitrary one.
	options.sort((a, b) => b.count - a.count || q.options.findIndex((o) => o.key === a.key) - q.options.findIndex((o) => o.key === b.key));
	return { questionId: q.id, prompt: q.prompt, answered, options, replies: repliesFor(rows, q.id) };
}

/** The provider's error text is long and often unique; its first line is the reason. */
export function reasonOf(error: string | null): string {
	const first = (error ?? '').split('\n')[0].trim();
	return first.length === 0 ? 'unknown' : first.length > 120 ? `${first.slice(0, 117)}...` : first;
}

export function summarise({ rows, questions, wildcard, futures, maxRenders, rendersByTable, now }: SummariseInput): Analytics {
	const tables: TableLine[] = rows.map((row) => {
		// Only the CURRENT image per zone counts as stored/pending/failed;
		// spend is a different question and comes from `rendersByTable`.
		let stored = 0;
		let pending = 0;
		let failed = 0;
		for (const img of row.images) {
			if (img.state === 'stored' || img.state === 'done') stored++;
			else if (img.state === 'failed') failed++;
			else pending++;
		}
		const firstAnswerAt = row.answers.reduce<number | null>((min, a) => (min === null || a.createdAt < min ? a.createdAt : min), null);
		const minutesToSubmit =
			row.submittedAt !== null && firstAnswerAt !== null ? Math.max(0, Math.round((row.submittedAt - firstAnswerAt) / 60_000)) : null;
		const renders = rendersByTable?.get(row.table) ?? row.images.reduce((n, img) => n + (img.attempt ?? 1), 0);
		return {
			table: row.table,
			futureKey: row.futureKey,
			answered: row.answers.filter((a) => questions.some((q) => q.id === a.questionId)).length,
			submittedAt: row.submittedAt,
			minutesToSubmit,
			stored,
			pending,
			failed,
			renders,
			atCap: renders >= maxRenders
		};
	});

	const lenses: LensCount[] = futures.map((f) => {
		const chosen = rows.filter((r) => r.futureKey === f.key).map((r) => r.table);
		return { key: f.key, name: f.name, count: chosen.length, tables: chosen };
	});
	lenses.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

	const reasonCounts = new Map<string, number>();
	for (const row of rows) {
		for (const img of row.images) {
			if (img.state !== 'failed') continue;
			const reason = reasonOf(img.error);
			reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
		}
	}

	return {
		generatedAt: now,
		totals: {
			tables: rows.length,
			started: tables.filter((t) => t.answered > 0).length,
			submitted: tables.filter((t) => t.submittedAt !== null).length,
			stored: tables.reduce((n, t) => n + t.stored, 0),
			pending: tables.reduce((n, t) => n + t.pending, 0),
			failed: tables.reduce((n, t) => n + t.failed, 0)
		},
		questions: questions.map((q) => breakdown(rows, q)),
		lenses,
		wildcards: repliesFor(rows, wildcard.id),
		tables,
		spend: {
			renders: tables.reduce((n, t) => n + t.renders, 0),
			cap: maxRenders,
			tablesAtCap: tables.filter((t) => t.atCap).map((t) => t.table),
			reasons: [...reasonCounts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
		}
	};
}
