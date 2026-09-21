/**
 * THE TAP FLOW'S CLIENT STATE — which screen the phone is on, and what the
 * server last said.
 *
 * `status` is `$state.raw` because it is a server snapshot replaced whole
 * on every poll, never mutated field by field (coding.md's immutability
 * rule, applied to runes). Everything read off it is `$derived`; the only
 * mutable field is the screen index, which is a local navigation cursor,
 * not data.
 *
 * **Nothing about progress is stored on the client.** Every tap writes an
 * answer row server-side, and `resumeIndex` derives the screen from those
 * answers — so a dead phone, replaced by a fresh one on the same URL,
 * lands on the same step with no session to restore. The cursor only
 * exists so *Back* can walk behind the resume point.
 */
import { ACTIVE_QUESTIONS, FUTURE_ID, STEP_IDS, WILDCARD } from "$lib/game/questions";
import type { Era } from "$lib/game/era";

export interface StatusAnswer {
  questionId: string;
  keys: string[];
  text?: Record<string, string>;
  pushReply?: string;
}

export interface TableStatus {
  table: number;
  future: string | null;
  era: Era | null;
  answers: StatusAnswer[];
  prompt: string;
  promptEdited: boolean;
  /** False when the room renders the hero, whose composer builds from the answers and ignores an edit. */
  promptEditable: boolean;
  images: {
    zoneKey: string;
    state: string;
    url: string | null;
    error: string | null;
  }[];
  /** The done screen's read-back paragraph, or null until one has been written (it arrives on a later poll). */
  narrative: string | null;
  submittedAt: number | null;
  closed: boolean;
  granted: boolean;
  canSubmit: boolean;
  gateReason: string;
}

/** `generate.ts`'s terminal states — a row in one of these will never change again. */
export const TERMINAL_IMAGE_STATES: ReadonlySet<string> = new Set(["stored", "done", "failed"]);

/**
 * Every render has ANSWERED, even if the answer was "it failed". The one
 * rule, shared by `resumeIndex` (which screen a fresh phone lands on) and
 * the Drawing screen's own advance check, so the two cannot disagree — they
 * did, and a table whose whole set failed waited on "Being drawn" for ever.
 */
export function allRendersSettled(status: Pick<TableStatus, "images">): boolean {
  return (
    status.images.length > 0 &&
    status.images.every((i) => TERMINAL_IMAGE_STATES.has(i.state))
  );
}

/** The pseudo-question id the future pick is stored under (mirrors answers.remote.ts). */
/** Re-exported from `game/questions.ts`, which is where the room-wide reads get it too. */
export { FUTURE_ID };

/** Every question after the lens screen (plus q12 when
 *  `ENABLE_PROPOSED_QUESTIONS` is on). The era is a chip on the lens screen,
 *  stored under `q1`, never a question in V4 — so `q1` is never a step. */
export const FLOW_QUESTIONS = ACTIVE_QUESTIONS.filter((q) => q.id !== "q1");

export type Step =
  | { kind: "landing" }
  | { kind: "future" }
  | { kind: "question"; id: string }
  | { kind: "wildcard" }
  | { kind: "review" }
  | { kind: "drawing" }
  | { kind: "images" }
  | { kind: "done" };

export const STEPS: Step[] = [
  { kind: "landing" },
  { kind: "future" },
  ...FLOW_QUESTIONS.map((q) => ({ kind: "question" as const, id: q.id })),
  { kind: "wildcard" },
  { kind: "review" },
  { kind: "drawing" },
  { kind: "images" },
  { kind: "done" },
];

const INDEX_OF = new Map(STEPS.map((s, i) => [stepKey(s), i]));

export function stepKey(step: Step): string {
  return step.kind === "question" ? step.id : step.kind;
}

export function indexOfStep(key: string): number {
  return INDEX_OF.get(key) ?? 0;
}

/**
 * The ids that count toward "n of N", in the order they are asked.
 *
 * `STEP_IDS` in `game/questions.ts` is the same list, and it is the one the
 * wall, the desk and the front page count against too — they used to count
 * a different set against a different denominator, and a table that had
 * only picked its lens read "2 of 4" on the projector while its own phone
 * said "1 of 6". Kept as a re-export rather than a second array.
 */
export const ANSWER_IDS = STEP_IDS;

function answered(answers: readonly StatusAnswer[], id: string): boolean {
  const a = answers.find((x) => x.questionId === id);
  return !!a && a.keys.length > 0;
}

/**
 * Where a phone picking this URL up should land. Derived from the stored
 * answers, never from a client cursor — the wildcard is optional, so a
 * table that skipped it still reaches review.
 */
export function resumeIndex(status: TableStatus): number {
  if (status.submittedAt) {
    const anyImage = status.images.some((i) => i.url);
    // Every render has ANSWERED, even if the answer was "it failed". Without
    // this, a table whose four renders all failed waits on the Drawing screen
    // for ever — there is nothing left to arrive, and *Draw again* only
    // exists on the Images screen.
    return indexOfStep(anyImage || allRendersSettled(status) ? "images" : "drawing");
  }
  if (status.answers.length === 0) return indexOfStep("landing");
  for (const id of ANSWER_IDS) {
    if (id === WILDCARD.id) continue; // optional — never blocks the way forward
    if (!answered(status.answers, id))
      return indexOfStep(id === FUTURE_ID ? "future" : id);
  }
  return indexOfStep("review");
}

/** Which required answers are still missing — what screen 15's button names. */
export function missingAnswers(status: TableStatus): string[] {
  return ANSWER_IDS.filter(
    (id) => id !== WILDCARD.id && !answered(status.answers, id),
  );
}

export function createTableState(initial: TableStatus) {
  let status = $state.raw(initial);
  let cursor = $state(resumeIndex(initial));

  const step = $derived(STEPS[Math.min(Math.max(cursor, 0), STEPS.length - 1)]);
  const answersById = $derived(
    new Map(status.answers.map((a) => [a.questionId, a])),
  );
  const missing = $derived(missingAnswers(status));
  const answerPosition = $derived(ANSWER_IDS.indexOf(stepKey(step)));
  const progress = $derived(
    answerPosition >= 0 ? `${answerPosition + 1} of ${ANSWER_IDS.length}` : "",
  );
  const done = $derived(!!status.submittedAt);

  return {
    get status() {
      return status;
    },
    /** Replace the snapshot wholesale. Never mutate a field on it. */
    set status(next: TableStatus) {
      status = next;
    },
    get step() {
      return step;
    },
    get progress() {
      return progress;
    },
    get missing() {
      return missing;
    },
    get done() {
      return done;
    },
    get canGoBack() {
      return cursor > 0 && step.kind !== "drawing" && step.kind !== "done";
    },
    answer(id: string) {
      return answersById.get(id);
    },
    next() {
      cursor = Math.min(cursor + 1, STEPS.length - 1);
    },
    back() {
      cursor = Math.max(cursor - 1, 0);
    },
    go(key: string) {
      cursor = indexOfStep(key);
    },
    /** Re-derive the screen from the server snapshot — used after submit and regenerate. */
    resync() {
      cursor = resumeIndex(status);
    },
  };
}

export type TableState = ReturnType<typeof createTableState>;
