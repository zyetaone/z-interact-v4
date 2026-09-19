/**
 * Constant-time secret comparison, written by hand rather than with
 * `crypto.subtle.timingSafeEqual` — that is a Cloudflare extension and is
 * absent under vitest/Node, so every test of a caller would have to mock
 * it. The comparison is short and the loop is the whole of it.
 *
 * Timing leakage on a shared query token at the edge is a small risk, but
 * `!==` returns on the first differing byte and this costs nothing.
 */
export function secretEquals(a: string | undefined | null, b: string | undefined | null): boolean {
	// Fails closed: a missing expected secret is never equal to anything,
	// so an unset variable cannot open a gate.
	if (!a || !b) return false;
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
