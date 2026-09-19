/**
 * FAKE D1 FOR TESTS — a real SQLite engine (`node:sqlite`, built into
 * Node 24, no dependency added) wearing the three-method `D1Database`
 * shape (`prepare().bind().first()/.run()/.all()`) that `d1.ts`'s callers
 * use. D1 *is* SQLite under the hood, so this runs the actual SQL our
 * schemas and queries contain (window functions, `ON CONFLICT ... DO
 * UPDATE`, etc.) rather than a hand-rolled fake that pattern-matches
 * query strings and risks the "fixtures that agree" trap — a mock that
 * only proves the mock's own assumptions.
 *
 * Test-only: never imported by non-test source (no `$app/server`, no
 * production import of `node:sqlite`).
 */
// @ts-expect-error — this is a Cloudflare Workers project (tsconfig's `types`
// is `["@cloudflare/workers-types"]` only, deliberately no `@types/node`), so
// there is no ambient declaration for Node's built-in `node:sqlite`. It still
// resolves and runs fine under vitest (Node), which is all this test-only
// file needs — the missing types are a `npm run check` cosmetic gap, not a
// runtime one.
import { DatabaseSync } from 'node:sqlite';

interface FakeStatement {
	bind(...args: unknown[]): FakeStatement;
	first<T>(): Promise<T | null>;
	run(): Promise<{ success: true }>;
	all<T>(): Promise<{ results: T[]; success: true }>;
}

export function fakeD1(): D1Database {
	const db = new DatabaseSync(':memory:');
	function prepare(sql: string): FakeStatement {
		let args: unknown[] = [];
		return {
			bind(...a: unknown[]) {
				args = a;
				return this;
			},
			async first<T>() {
				const row = db.prepare(sql).get(...(args as never[]));
				return (row as T) ?? null;
			},
			async run() {
				db.prepare(sql).run(...(args as never[]));
				return { success: true as const };
			},
			async all<T>() {
				const rows = db.prepare(sql).all(...(args as never[]));
				return { results: rows as T[], success: true as const };
			}
		};
	}
	return { prepare } as unknown as D1Database;
}
