/**
 * "SOMEWHERE FROM OUR IMAGINATION" — the fifth slot the owner asked for
 * ("reduce this to 4 options and leave a paragraph for 5").
 *
 * It is the only option in the app whose fragment is ENTIRELY the table's
 * own words: `promptFragment: '{text}'`. Everything else contributes a
 * written clause and the typed reply is an extra. So this one has a failure
 * mode none of the others have — picked and left blank, it contributes
 * nothing, and the deep-work layer silently disappears from the prompt.
 */
import { describe, expect, it } from 'vitest';
import { composeHeroPrompt } from './hero';
import type { AnswerLike } from './layers';

const BASE: AnswerLike[] = [
	{ questionId: 'q2', keys: ['warm-earthy'] },
	{ questionId: 'q8', keys: ['deliberate-pockets'] },
	{ questionId: 'q6r', keys: ['water-room'] }
];
const hero = (answers: AnswerLike[]) =>
	composeHeroPrompt({ futureKey: 'garden-city', answers, table: 4 } as never);

const open = (text?: string): AnswerLike => ({
	questionId: 'q5c',
	keys: ['other-space'],
	...(text === undefined ? {} : { text: { 'other-space': text } })
});

describe('the open deep-work option', () => {
	it('puts the table\'s own words in the prompt', () => {
		const p = hero([...BASE, open('A library carved into the cliff face.')]);
		expect(p).toContain('A library carved into the cliff face.');
		expect(p).toContain('Deep work happens as');
	});

	it('drops the clause entirely rather than leaving a dangling lead-in', () => {
		const p = hero([...BASE, open('')]);
		// The composer is already safe here: no text means no fragment means no
		// clause, rather than "Deep work happens as ." for the model to finish.
		expect(p).not.toContain('Deep work happens as');
	});

	it('...which is exactly why the SCREEN must not accept it — the question would vanish', () => {
		// The composer being safe is not the same as the table being served.
		// Picking this option and typing nothing loses the whole deep-work
		// layer from the picture, and nothing anywhere says so. `OptionList`
		// is what refuses it; this is the reason that rule exists.
		const blank = hero([...BASE, open('')]);
		const answered = hero([...BASE, open('A library carved into the cliff.')]);
		expect(answered.length).toBeGreaterThan(blank.length);
	});

	it('is absent, not empty, when the option is picked with no text at all', () => {
		const p = hero([...BASE, open()]);
		expect(p).not.toMatch(/Deep work happens as\s*[.,]/);
	});
});
