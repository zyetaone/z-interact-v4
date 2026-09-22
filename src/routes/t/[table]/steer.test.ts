/**
 * THE STEER REACHES THE PICTURE. The prompt edit did not.
 *
 * `prompt-edit.test.ts` pins the finding this feature exists because of: on
 * the default zone set, `composePromptFor` builds the hero prompt from the
 * answers and ignores `ctx.composed` entirely, so a table that edited the
 * review screen's prompt had its words accepted, stored and discarded. The
 * screen is read-only now, and this is the capability that replaced it.
 *
 * So the assertion that matters is not "a steer is stored" — it is "a steer
 * is in the string submitted to fal", on BOTH composers, in the position the
 * wildcard occupies. A steer that only reached D1 would be the same bug with
 * a new name.
 */
import { describe, expect, it } from 'vitest';
import { composeHeroPrompt, composePromptFor } from './hero';
import { HERO_ZONE } from '$lib/game/zones';
import { buildLayerInputs, type AnswerLike } from './layers';
import { STEER, WILDCARD } from '$lib/game/questions';

const BASE: AnswerLike[] = [
	{ questionId: 'q2', keys: ['warm-earthy'] },
	{ questionId: 'q8', keys: ['deliberate-pockets'] },
	{ questionId: 'q5c', keys: ['glass-dome'] },
	{ questionId: 'q6r', keys: ['water-room'] }
];

const steerRow = (text: string): AnswerLike => ({
	questionId: STEER.id,
	keys: [STEER.options[0].key],
	text: { [STEER.options[0].key]: text }
});
const wildRow = (text: string): AnswerLike => ({
	questionId: WILDCARD.id,
	keys: [WILDCARD.options[0].key],
	text: { [WILDCARD.options[0].key]: text }
});

const hero = (answers: AnswerLike[]) =>
	composeHeroPrompt({ futureKey: 'garden-city', answers, table: 4 } as never);

describe('the steer', () => {
	it('is in the hero prompt, verbatim', () => {
		const p = hero([...BASE, steerRow('Make the stair the centre of the room.')]);
		expect(p).toContain('Make the stair the centre of the room.');
	});

	it('is absent when nothing was typed — no empty clause, no stray punctuation', () => {
		const withSteer = hero([...BASE, steerRow('')]);
		const without = hero(BASE);
		expect(withSteer).toBe(without);
	});

	it('lands AFTER the wildcard, which is the most-recent-last rule', () => {
		const p = hero([...BASE, wildRow('A long balcony.'), steerRow('More light.')]);
		expect(p.indexOf('More light.')).toBeGreaterThan(p.indexOf('A long balcony.'));
	});

	it('lands BEFORE the Avoid list, so it cannot push the guards off the end', () => {
		const p = hero([...BASE, steerRow('More light.')]);
		expect(p.indexOf('More light.')).toBeLessThan(p.indexOf('Avoid:'));
		expect(p.trimEnd().endsWith('no text')).toBe(true);
	});

	it('is capped, and the cap is applied to what is DRAWN, not just to what is stored', () => {
		const long = 'x'.repeat(400);
		const p = hero([...BASE, steerRow(long)]);
		expect(p).not.toContain('x'.repeat(200));
	});

	it('reaches the four-zone composer too, not only the hero', () => {
		const built = buildLayerInputs({
			futureKey: 'garden-city',
			answers: [...BASE, steerRow('A copper roof.')],
			table: 4
		} as never);
		expect(built.wildcard ?? '').toContain('A copper roof.');
	});

	it('survives the path the app actually calls — composePromptFor, default zone set', () => {
		const p = composePromptFor(HERO_ZONE, {
			futureKey: 'garden-city',
			answers: [...BASE, steerRow('A copper roof.')],
			table: 4
		} as never);
		expect(p).toContain('A copper roof.');
	});
});
