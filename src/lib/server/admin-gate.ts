/**
 * ONE ADMIN_TOKEN RULE, in one file, because there were two.
 *
 * Found in the 21 Sep route review. The desk (`admin.remote.ts`) and the
 * readout (`analytics.remote.ts`) each carried a private `checkToken` that
 * treats an UNSET `ADMIN_TOKEN` as open in dev and closed in production.
 * `/health` and `/simulate` called `secretEquals(env.ADMIN_TOKEN, token)`
 * directly, and `secretEquals` reports "not equal" when the expected value
 * is missing — so an unset token closes those two everywhere, dev included.
 *
 * Neither is wrong and both fail closed in production, which is the rule
 * CLAUDE.md states. The defect was that the difference lived in four
 * copies and nothing said which was intended where, so the next person to
 * add an admin surface picked whichever file they happened to read.
 *
 * So: ONE implementation, and the difference becomes a named argument at
 * the call site. The DEFAULT is the strict one — a new caller that thinks
 * about nothing gets the closed door. `devOpen: true` is the screens'
 * opt-in, and it is spelled out where it is chosen rather than inferred
 * from which helper was imported.
 *
 * NOTHING'S BEHAVIOUR CHANGED when this landed: the two screens pass
 * `devOpen`, the two endpoints do not. Loosening `/simulate` in particular
 * would have been a money decision (it spends with a live key), not a
 * tidying one.
 */
import { dev } from '$app/environment';
import { secretEquals } from './secret';

export interface AdminGateOptions {
	/**
	 * When `ADMIN_TOKEN` is unset, allow the call in dev. Production is
	 * unaffected: `dev` is false there, so unset still means closed.
	 * Off by default.
	 */
	devOpen?: boolean;
}

/**
 * True when `token` may act as the admin. `expected` is read from the env
 * by the caller so this stays free of `$app/server` and testable with a
 * plain object.
 */
export function adminTokenOk(
	expected: string | undefined,
	token: string | null | undefined,
	{ devOpen = false }: AdminGateOptions = {}
): boolean {
	if (!expected) return devOpen && dev;
	return secretEquals(token, expected);
}
