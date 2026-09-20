/**
 * The hero prompt's four risks: an answer that silently never arrives, a
 * frame that outgrows its budget, the lens leaking its internal key onto a
 * paid render, and the lens dragging a time of day in with it.
 *
 * The last one is not hypothetical. `futures.ts` keeps `moodLine` (which
 * opens "Night, high above a vertical megacity") apart from `worldOutside`
 * / `styleDna` / `insideCue` precisely so a lens survives daylight, and
 * q11's feel words own light and weather. A hero prompt that reached for
 * `moodLine` would put every neo-seoul table in the dark whatever they
 * answered.
 */
import { describe, expect, it } from 'vitest';
import { composeHeroPrompt, HERO_WORD_TARGET } from './hero';
import { wordCount, type AnswerLike } from './layers';
import { FUTURES } from '$lib/game/futures';
import { IMPOSSIBLE_IDEAS } from '$lib/game/zones';
import { NO_TEXT } from '$lib/server/prompt';

/** Table 10's rehearsal answers — the set the scratch sample is composed from. */
const T10: AnswerLike[] = [
	{ questionId: 'future', keys: ['neo-seoul'] },
	{ questionId: 'q1', keys: ['hyperfuturistic-2040'] },
	{ questionId: 'q2', keys: ['soft-pastel'] },
	{ questionId: 'q2:and', keys: ['generous'] },
	{ questionId: 'q3', keys: ['explains-itself'] },
	{ questionId: 'q3:and', keys: ['on-the-journey'] },
	{ questionId: 'q4w', keys: ['no-workstation'] },
	{ questionId: 'q4w:and', keys: ['nothing'] },
	{ questionId: 'q5c', keys: ['thinking-walk'] },
	{ questionId: 'q5c:and', keys: ['in-the-room'] },
	{ questionId: 'q6r', keys: ['rain-forest'] },
	{ questionId: 'q6r:and', keys: ['a-view-of-it'] },
	{ questionId: 'q7', keys: ['light-and-sound'] },
	{ questionId: 'q8', keys: ['landscape-indoors'] },
	{ questionId: 'q10', keys: ['supports-judgement'] },
	{ questionId: 'q10:and', keys: ['a'] },
	{ questionId: 'q11', keys: ['alive', 'effortless', 'yours'] }
];

const t10 = () => composeHeroPrompt({ futureKey: 'neo-seoul', answers: T10, table: 10 });

describe('every answer reaches the hero prompt', () => {
	it('carries each zone-worthy act, its "And:" pick, and the frame that holds them', () => {
		const p = t10();
		// The four acts, each with its sub-question's fragment beside it.
		expect(p).toMatch(/Arrival: clear sightlines[^.]*a route lighting ahead of the visitor/);
		expect(p).toMatch(/Deep work: one person walking a loop[^.]*a hologram or figure at the table/);
		expect(p).toMatch(/Stations: no desks[^.]*no visible technology at the desk/);
		expect(p).toMatch(/Recharge: rain forest[^.]*only a view through the far glass/);
	});

	it('carries the room participating, nature, the consequence, the materials, the scale and the feel words', () => {
		const p = t10();
		// q7 arrives as its ROOM_PARTICIPATES clause, not as its option fragment.
		expect(p).toContain('a wall brightens toward whoever walks to it and dims behind them');
		expect(p).toContain('trees, water, rock and soil indoors'); // q8
		expect(p).toContain('one oversized room built for a hard decision, in use'); // q10
		expect(p).toContain('blush, sage and butter'); // q2
		expect(p).toContain('wide lens, high ceilings, open floor'); // q2:and, as the camera
		// q11's three picks, as light and weather.
		expect(p).toContain('leaves, water and birds moving');
		expect(p).toContain('nothing in the way');
		expect(p).toContain('one personal object in the foreground');
	});

	it('carries the lens world, the indoor cue, the impossible idea and the era year', () => {
		const p = t10();
		const neoSeoul = FUTURES.find((f) => f.key === 'neo-seoul')!;
		expect(p).toContain(neoSeoul.worldOutside);
		expect(p).toContain(neoSeoul.styleDna);
		expect(p).toContain(neoSeoul.insideCue);
		expect(IMPOSSIBLE_IDEAS['neo-seoul']).toContain(IMPOSSIBLE_IDEAS['neo-seoul'][10 % 2]);
		expect(p).toContain(IMPOSSIBLE_IDEAS['neo-seoul'][10 % 2]);
		expect(p).toContain('relevant in 2040');
	});

	it('asks the model to design, and states the one elevated three-quarter view', () => {
		const p = t10();
		expect(p.startsWith('Design a workplace')).toBe(true);
		expect(p).toContain('one elevated three-quarter view');
		expect(p).toContain('one continuous building');
	});

	it('names q10\'s "hardest" pick nowhere — it is for the wall and the ledger, not a subject', () => {
		// q10:and 'a' is "the hardest trade-off was ..." — a sentence about the
		// table, which has nothing to paint.
		expect(t10()).not.toMatch(/hardest trade-off/);
	});
});

describe('the word ceiling', () => {
	it('lands inside the measured window for a fully answered table', () => {
		const n = wordCount(t10());
		expect(n).toBeGreaterThanOrEqual(HERO_WORD_TARGET.min);
		expect(n).toBeLessThanOrEqual(HERO_WORD_TARGET.max);
	});

	it('OVERSHOOTS the 150-190 the brief asked for, and this test says so out loud', () => {
		// Not a passing grade dressed as one. See HERO_WORD_TARGET's note: ~137
		// of these words are answer fragments reused verbatim from layers.ts, so
		// the only way under 190 is to drop answers or to re-word fragments in a
		// second place. If someone later shortens the fragment set or the
		// template enough to land in the window, THIS test fails and the
		// constant should be corrected to say so.
		const n = wordCount(t10());
		expect(n).toBeGreaterThan(HERO_WORD_TARGET.briefAsked.max);
	});

	it('stays under the ceiling for every lens, on the same fully answered table', () => {
		for (const future of FUTURES) {
			const n = wordCount(composeHeroPrompt({ futureKey: future.key, answers: T10, table: 10 }));
			expect(n).toBeLessThanOrEqual(HERO_WORD_TARGET.max);
		}
	});
});

describe('what the lens may and may not contribute', () => {
	it('uses the plain name, never the internal key', () => {
		const p = t10();
		expect(p).toContain('the dense and lit city');
		expect(p).not.toContain('neo-seoul');
		// And for every lens: no key, and the name present.
		for (const future of FUTURES) {
			const one = composeHeroPrompt({ futureKey: future.key, answers: T10, table: 3 });
			expect(one).not.toContain(future.key);
			expect(one.toLowerCase()).toContain(future.name.toLowerCase().replace(/^the /, 'the '));
		}
	});

	it('carries no time-of-day or weather term from the lens — those belong to q11 alone', () => {
		// `moodLine` is where night lives; it must never be read here.
		for (const future of FUTURES) {
			const p = composeHeroPrompt({ futureKey: future.key, answers: T10, table: 10 });
			expect(p).not.toMatch(/\b(night|nighttime|dusk|dawn|sunset|sunrise|midnight|evening|twilight|golden hour)\b/i);
			expect(p).not.toContain(future.moodLine);
		}
	});
});

describe('the guards', () => {
	it('says "no text" at both ends, like the zone prompts', () => {
		const p = t10();
		const firstSentence = p.slice(0, p.indexOf('. ', p.indexOf('three-quarter view')));
		expect(firstSentence).toContain(NO_TEXT);
		expect(p.endsWith(NO_TEXT)).toBe(true);
	});

	it('appends the one negative list, anti-board terms and all', () => {
		const p = t10();
		expect(p).toMatch(/Avoid: /);
		for (const term of ['collage', 'grid', 'split screen', 'labels', 'personas', 'stark white']) {
			expect(p).toContain(term);
		}
		// The lens's own terms ride in the same list.
		expect(p).toContain('rural');
	});

	it('keeps paper notebooks out of the negatives when the table chose paper', () => {
		const paper = T10.map((a) => (a.questionId === 'q7' ? { ...a, keys: ['paper-and-pens'] } : a));
		const p = composeHeroPrompt({ futureKey: 'neo-seoul', answers: paper, table: 10 });
		expect(p).toContain('the room stays still; paper on the walls, pinned and rewritten by hand');
		expect(p).not.toContain('paper notebooks');
	});
});

describe('a half-answered table', () => {
	it('omits an act it has no answer for rather than printing an empty label', () => {
		const p = composeHeroPrompt({
			futureKey: 'solarpunk',
			answers: [
				{ questionId: 'q1', keys: ['recognisably-2035'] },
				{ questionId: 'q3', keys: ['explains-itself'] }
			],
			table: 2
		});
		expect(p).toContain('Arrival: clear sightlines');
		expect(p).not.toMatch(/Deep work:/);
		expect(p).not.toMatch(/Stations:/);
		expect(p.endsWith(NO_TEXT)).toBe(true);
	});

	it('falls back to the house window and drops the lens clause when no lens was chosen', () => {
		const p = composeHeroPrompt({ answers: [{ questionId: 'q3', keys: ['explains-itself'] }], table: 1 });
		expect(p).toContain('an ordinary mid-rise city');
		expect(p).not.toMatch(/for a team that chose/);
		// Unanswered era falls back to the same default the zone path uses.
		expect(p).toContain('relevant in 2035');
	});
});
