/**
 * THE LINE UNDER THE FREE-TEXT BOX.
 *
 * Every question now takes the table's own words (`QuestionScreen.svelte`),
 * where before only the two questions the owner wrote a PUSH line for did.
 * That text is kept — wall, export, `image_detail` — but it is composed into
 * a paid render for exactly ONE question, q2's "name two materials you would
 * actually want to touch", because the owner asked for that one word for
 * word. Everything else typed at a table is a thing said in a room, not a
 * thing drawn.
 *
 * This holds that line for both prompt paths at once, with a sentinel per
 * question so a failure names the question that leaked.
 */
import { describe, expect, it } from 'vitest';
import { QUESTIONS } from '$lib/game/questions';
import { ZONE_SETS } from '$lib/game/zones';
import { composeHeroPrompt } from './hero';
import { buildLayerInputs, composeBase, composeZonePrompt, resolveZone, type AnswerLike } from './layers';

/** One question whose typed reply IS drawn, by the owner's instruction. */
const DRAWN = 'q2';

const sentinel = (id: string) => `sentinel${id.replace(/[^a-z0-9]/g, '')}phrase`;

const ANSWERS: AnswerLike[] = QUESTIONS.map((q) => ({
	questionId: q.id,
	keys: q.options.slice(0, q.select.kind === 'pick' ? q.select.n : 1).map((o) => o.key),
	pushReply: sentinel(q.id)
}));

describe('a typed reply is never drawn, except where the owner said so', () => {
	it('keeps every question but q2 out of the hero prompt', () => {
		const prompt = composeHeroPrompt({ table: 4, futureKey: 'solarpunk', era: 'hyperfuturistic-2040', answers: ANSWERS });
		for (const q of QUESTIONS) {
			const present = prompt.includes(sentinel(q.id));
			expect(present, `${q.id} typed reply in the hero prompt`).toBe(q.id === DRAWN);
		}
	});

	it('keeps every question but q2 out of all four zone prompts', () => {
		const built = buildLayerInputs({ futureKey: 'solarpunk', era: 'hyperfuturistic-2040', answers: ANSWERS });
		const base = composeBase(built);
		for (const zone of ZONE_SETS.book) {
			const prompt = composeZonePrompt(base, resolveZone(zone, ANSWERS), built.negative);
			for (const q of QUESTIONS) {
				const present = prompt.includes(sentinel(q.id));
				expect(present, `${q.id} typed reply in the ${zone.key} prompt`).toBe(q.id === DRAWN);
			}
		}
	});
});
