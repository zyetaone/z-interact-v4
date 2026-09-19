/**
 * CLIENT SNAPSHOT STATE for `/t/[table]` — `$state.raw` because `status` is
 * a server snapshot replaced wholesale on every poll tick, never mutated
 * field-by-field (coding.md's immutability rule, applied to runes: `.raw`
 * is where "don't mutate" earns its keep). Everything derived from it is
 * `$derived`, no `$effect` fan-out.
 *
 * TODO(content): `question` indexing against `QUESTIONS` depends on the
 * real question count/order from game/questions.ts.
 */
import { QUESTIONS } from '$lib/game/questions';

export interface TableStatus {
	table: number;
	currentStep: number;
	submittedAt: number | null;
	closed: boolean;
	granted: boolean;
}

export function createTableState(initial: TableStatus) {
	let status = $state.raw(initial);

	const step = $derived(status.currentStep);
	const question = $derived(QUESTIONS[step - 1]);
	const progress = $derived(`${Math.min(step, QUESTIONS.length + 1)} / ${QUESTIONS.length + 1}`);
	const done = $derived(!!status.submittedAt);

	return {
		get status() {
			return status;
		},
		set status(next: TableStatus) {
			status = next;
		},
		get step() {
			return step;
		},
		get question() {
			return question;
		},
		get progress() {
			return progress;
		},
		get done() {
			return done;
		}
	};
}
