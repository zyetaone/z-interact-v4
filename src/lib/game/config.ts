/**
 * GAME FLAGS — content-side toggles that gate optional questions/screens
 * without touching the shape guards the 11-question set relies on.
 *
 * `ENABLE_PROPOSED_QUESTIONS` gates `questions.ts`'s two PROPOSED questions
 * (q12, q13 — game-flow.md §7's "workstation ↔ urban alignment" and "how
 * teams form"). Off by default: the question owner has not blessed them
 * yet, and `questions.ts`'s own guards assert exactly 11 *active*
 * questions when this is false.
 */
export const ENABLE_PROPOSED_QUESTIONS = false;
