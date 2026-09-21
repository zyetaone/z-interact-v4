/**
 * THE HOUSE HALF RIDES IN `system_prompt`, AND THE PROMPT STILL SAYS IT.
 *
 * Generation 1 had no such field, so every house rule — camera, lighting,
 * the single-frame instruction, the no-text guard, the Avoid list — went
 * into one string with the table's own answers. nano-banana-2 documents a
 * `system_prompt` input (`fal.ts`'s schema note, checked 19 Sep) and this
 * is that constant tail moved into the field made for it.
 *
 * What these tests hold is the SAFETY of the move rather than the move
 * itself. `fal.ts` warns two screens above `submitZoneImage` that an
 * unrecognised field is accepted with a 200 and silently dropped. If the
 * house rules had been deleted from the composed prompt in the same change
 * that added them here, a dropped field would strip the no-text guard and
 * the Avoid list from every render at once, with a 200 on every submit and
 * nothing anywhere to read as a failure.
 *
 * So the last test is the important one: the composed prompt must STILL
 * carry the rules on its own. Delete that assertion only together with a
 * real render proving the field lands.
 */
import { describe, expect, it } from 'vitest';
import { HOUSE_SYSTEM, systemPromptFrom } from './prompt';
import { composeHeroPrompt } from '../../routes/t/[table]/hero';

describe('SYSTEM_PROMPT', () => {
	it('sends the house rules unless explicitly turned off', () => {
		expect(systemPromptFrom(undefined)).toBe(HOUSE_SYSTEM);
		expect(systemPromptFrom('')).toBe(HOUSE_SYSTEM);
		expect(systemPromptFrom('on')).toBe(HOUSE_SYSTEM);
	});

	it('`off` sends no field at all, which is the revert', () => {
		// Undefined, never '' — an empty system prompt is a different
		// instruction from no system prompt, and `fal.ts` spreads on truthiness
		// so only undefined actually omits the key.
		expect(systemPromptFrom('off')).toBeUndefined();
		expect(systemPromptFrom('OFF')).toBeUndefined();
		expect(systemPromptFrom('  off  ')).toBeUndefined();
	});

	it('states the rules a negative cannot enforce as positives', () => {
		// The contact-sheet finding (hero.ts's SINGLE_FRAME note): the Avoid
		// list said "collage, grid, split screen" and six of twenty came back
		// as collages anyway, because negatives bias and do not forbid. The
		// system prompt says what the frame IS before it says what it is not.
		expect(HOUSE_SYSTEM).toMatch(/one continuous space/i);
		expect(HOUSE_SYSTEM).toMatch(/never panels, insets, collage/i);
		expect(HOUSE_SYSTEM).toMatch(/never text, signage, labels/i);
		expect(HOUSE_SYSTEM).toMatch(/24mm/);
		// The work-surface rule, added after a real render came back full of
		// laptops. Positive first, negative second — in that order, because
		// the negative alone is what had just been measured failing.
		expect(HOUSE_SYSTEM).toMatch(/bare tables of timber or stone/i);
		expect(HOUSE_SYSTEM.indexOf('bare tables')).toBeLessThan(HOUSE_SYSTEM.indexOf('Never laptops'));
	});
});

describe('the composed prompt is not leaning on the new field', () => {
	const prompt = composeHeroPrompt({
		futureKey: 'solarpunk',
		era: null,
		table: 7,
		answers: [
			{ questionId: 'q8', keys: ['saturated'] },
			{ questionId: 'q5c', keys: ['glass-dome'] },
			{ questionId: 'q6r', keys: ['igloo'] },
			{ questionId: 'q2', keys: ['warm-earthy'] }
		]
	});

	it('still forbids text on its own', () => {
		expect(prompt.toLowerCase()).toContain('no text');
	});

	it('still asks for one frame on its own', () => {
		expect(prompt).toMatch(/one single photograph|one continuous/i);
	});

	it('still carries an Avoid list on its own', () => {
		expect(prompt).toMatch(/avoid/i);
	});
});
