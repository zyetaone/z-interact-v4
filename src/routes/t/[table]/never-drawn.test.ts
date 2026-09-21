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
import { NO_TEXT } from '$lib/server/prompt';
import { composeHeroPrompt, MAX_HERO_CHARS } from './hero';
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

/**
 * q2's reply IS drawn, so it is the one place a table's keystrokes reach a
 * paid render — and, until every question got a box, the only one anybody
 * had to think about. The zone path was stripped and capped; the hero path
 * did not pass through that code at all.
 */
describe('the one typed reply that is drawn is still sanitised', () => {
	const hero = (reply: string) =>
		composeHeroPrompt({
			table: 4,
			futureKey: 'solarpunk',
			era: 'hyperfuturistic-2040',
			answers: [{ questionId: 'q2', keys: ['deep-low-lit'], pushReply: reply }]
		});

	it('strips control characters and folded whitespace out of q2s reply', () => {
		const prompt = hero('brass\u0000 and\n\n\tcracked   terrazzo\u001b');
		expect(prompt).toContain('brass and cracked terrazzo');
		expect(prompt).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/);
		expect(prompt).not.toMatch(/\s{2}/);
	});

	/**
	 * The ceiling cuts from the END, and the Avoid clause is at the end — so
	 * the clause survives only because the boundary caps the reply first.
	 * 500 (`SaveAnswerInput`) on top of a ~1,860-character hero leaves room
	 * under 2,400. This is the assertion that fails if either number moves.
	 */
	it('keeps the Avoid clause with the longest reply the boundary will accept', () => {
		const prompt = hero('m'.repeat(500));
		expect(prompt.length).toBeLessThanOrEqual(MAX_HERO_CHARS);
		expect(prompt).toContain('Avoid:');
		expect(prompt.endsWith(NO_TEXT)).toBe(true);
	});

	it('cuts from the end when a reply arrives longer than the boundary allows', () => {
		const prompt = hero('marble '.repeat(600));
		expect(prompt.length).toBeLessThanOrEqual(MAX_HERO_CHARS);
	});
});
