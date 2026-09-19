/**
 * GAME FLAGS — content-side toggles that gate optional questions/screens
 * without touching the shape guards the 11-question set relies on.
 *
 * `ENABLE_PROPOSED_QUESTIONS` gates `questions.ts`'s one PROPOSED question
 * (q12 — game-flow.md §7's "workstation ↔ urban alignment"; the other
 * proposal, "how teams form", is superseded by V3's own Q9/Q10). Off by
 * default: the question owner has not blessed it yet, and `questions.ts`'s
 * own guards assert exactly 11 *active* questions when this is false.
 */
export const ENABLE_PROPOSED_QUESTIONS = false;
