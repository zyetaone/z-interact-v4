/**
 * QUESTION SET — TODO(content), owned by the game-flow workstream.
 *
 * Fixed interface the plumbing builds against (routes, `answers.remote.ts`,
 * `prompt.ts`'s programme layer): an ordered `QUESTIONS` array, each with a
 * stable `id` (used as the D1 `answers.question_id` and never renumbered —
 * renumbering would orphan already-saved rows) and 4-6 `options`, plus an
 * optional free-text wildcard question.
 *
 * Content agent: replace `QUESTIONS` and `WILDCARD` below. Keep `id` stable
 * once tables start answering; add new ids rather than reusing old ones.
 */

export const TABLE_COUNT = 20;

export interface QuestionOption {
	key: string;
	label: string;
}

export interface Question {
	id: string;
	prompt: string;
	options: QuestionOption[];
	/** Which prompt layer this question's answer feeds. TODO(content): confirm mapping with prompt.ts's LayerInputs. */
	layer: 'materialsAndLight' | 'programme' | 'feel';
}

// TODO(content): replace with the real 11 questions (question-schema.md §1).
export const QUESTIONS: Question[] = [
	{
		id: 'q1',
		prompt: 'TODO(content): question 1 text',
		options: [
			{ key: 'a', label: 'TODO(content)' },
			{ key: 'b', label: 'TODO(content)' }
		],
		layer: 'materialsAndLight'
	}
];

export interface WildcardQuestion {
	id: 'wildcard';
	prompt: string;
}

// TODO(content): confirm wildcard prompt wording.
export const WILDCARD: WildcardQuestion = {
	id: 'wildcard',
	prompt: 'TODO(content): anything else you want your 2035 workspace to have?'
};

export interface TableAnswers {
	table: number;
	future?: string;
	byQuestion: Record<string, { keys: string[]; text?: Record<string, string> }>;
	wildcard?: string;
}
