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
import { composeHeroPrompt, HERO_WORD_TARGET, NO_SIGNAGE_TEXT } from './hero';
import { wordCount, type AnswerLike } from './layers';
import { FUTURES } from '$lib/game/futures';
import { TABLE_COUNT } from '$lib/game/questions';
import { IMPOSSIBLE_IDEAS, impossibleIdea, vantageFor, VANTAGES } from '$lib/game/zones';
import { NO_TEXT } from '$lib/server/prompt';
import { DEFAULT_ASPECT_RATIO } from '$lib/server/fal';

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
		expect(p).toMatch(/People arrive by clear sightlines[^.]*a route lighting ahead of the visitor/);
		expect(p).toMatch(/Deep work happens as one person walking a loop[^.]*a hologram or figure at the table/);
		expect(p).toMatch(/They work at no desks[^.]*no visible technology at the desk/);
		expect(p).toMatch(/They recharge in rain forest[^.]*only a view through the far glass/);
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
		expect(p).toContain(impossibleIdea('neo-seoul', 10)!);
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


describe('the judge has to be able to tell two tables apart', () => {
	/** Twenty tables, ONE lens, IDENTICAL answers — the worst case the room can produce. */
	const sameLens = (table: number, futureKey = 'solarpunk') =>
		composeHeroPrompt({ futureKey, answers: T10, table });

	it('composes a different prompt for every table in the room, on one lens with identical answers', () => {
		// This is the defect the question owner reported: with four zones, two
		// such tables still made eight different pictures; with one image each
		// they made the SAME picture, and there was nothing to judge.
		const prompts = Array.from({ length: TABLE_COUNT }, (_, i) => sameLens(i + 1));
		expect(new Set(prompts).size).toBe(TABLE_COUNT);
	});

	it('gives every table in the room its own vantage, and never repeats one', () => {
		expect(VANTAGES.length).toBeGreaterThanOrEqual(TABLE_COUNT);
		expect(new Set(VANTAGES).size).toBe(VANTAGES.length);
		const used = Array.from({ length: TABLE_COUNT }, (_, i) => vantageFor(i + 1));
		expect(new Set(used).size).toBe(TABLE_COUNT);
		// And the vantage is IN the prompt, not merely computed.
		for (let t = 1; t <= TABLE_COUNT; t++) expect(sameLens(t)).toContain(vantageFor(t));
	});

	it('tables 3 and 7 differ in BOTH the vantage and the impossible idea', () => {
		// The owner's own example: same lens, same answers, two tables.
		const three = sameLens(3);
		const seven = sameLens(7);
		expect(three).not.toBe(seven);
		expect(vantageFor(3)).not.toBe(vantageFor(7));
		expect(impossibleIdea('solarpunk', 3)).not.toBe(impossibleIdea('solarpunk', 7));
		expect(three).toContain(vantageFor(3));
		expect(three).toContain(impossibleIdea('solarpunk', 3)!);
		expect(seven).toContain(vantageFor(7));
		expect(seven).toContain(impossibleIdea('solarpunk', 7)!);
	});

	it('names the limit rather than hiding it: five ideas cannot make twenty tables unique', () => {
		// Pigeonhole, stated as a test so nobody reads the suite as a promise
		// it does not make. Tables five apart on one lens SHARE an impossible
		// idea; the vantage is what separates them, and the prompts still
		// differ. If the pool ever grows past the room, this test fails and
		// the claim above it should be strengthened.
		expect(IMPOSSIBLE_IDEAS.solarpunk.length).toBeLessThan(TABLE_COUNT);
		expect(impossibleIdea('solarpunk', 3)).toBe(impossibleIdea('solarpunk', 8));
		expect(vantageFor(3)).not.toBe(vantageFor(8));
		expect(sameLens(3)).not.toBe(sameLens(8));
	});

	it('keeps a table on the same vantage across a redraw, so a redraw reads as the same building again', () => {
		// Seeded by table number alone — not by answers, not by attempt — so
		// *Draw again* is the same viewpoint, which is what makes it read as a
		// second attempt at one building rather than a different table's.
		expect(vantageFor(4)).toBe(vantageFor(4));
		const first = sameLens(4);
		const afterAnEdit = composeHeroPrompt({
			futureKey: 'solarpunk',
			answers: [...T10, { questionId: 'q11', keys: ['calm', 'quiet', 'sacred'] }],
			table: 4
		});
		expect(afterAnEdit).toContain(vantageFor(4));
		expect(first).toContain(vantageFor(4));
	});

	it('keeps the six lenses apart: distinct style DNA, each in its own prompt and no other', () => {
		const dna = FUTURES.map((f) => f.styleDna);
		expect(new Set(dna).size).toBe(FUTURES.length);

		for (const future of FUTURES) {
			const p = composeHeroPrompt({ futureKey: future.key, answers: T10, table: 5 });
			expect(p).toContain(future.styleDna);
			// No other lens's signatures leak into this one.
			for (const other of FUTURES) {
				if (other.key === future.key) continue;
				expect(p).not.toContain(other.styleDna);
				expect(p).not.toContain(other.insideCue);
			}
		}
	});

	it('still differs table to table across every lens, not just solarpunk', () => {
		for (const future of FUTURES) {
			const prompts = Array.from({ length: TABLE_COUNT }, (_, i) => sameLens(i + 1, future.key));
			expect(new Set(prompts).size, future.key).toBe(TABLE_COUNT);
		}
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

describe('the labels that got painted on the building', () => {
	it('carries no colon-label for any of the four acts', () => {
		// THE DEFECT, from the first real render of the table-10 prompt: the
		// words "Arrival", "Deep work", "Stations" and "Recharge" came back as
		// signage on the building's walls. A colon-label reads to an image model
		// as a caption to draw. Every act is a verb-led sentence now.
		for (const future of FUTURES) {
			const p = composeHeroPrompt({ futureKey: future.key, answers: T10, table: 10 });
			expect(p).not.toMatch(/\b(Arrival|Deep work|Stations|Recharge):/);
		}
	});

	it('states the acts as prose with verbs', () => {
		const p = t10();
		expect(p).toContain('People arrive by');
		expect(p).toContain('Deep work happens as');
		expect(p).toContain('They work at');
		expect(p).toContain('They recharge in');
	});

	it('does not assume what the table chose in the lead-in', () => {
		// "There are no fixed desks" would contradict a table that chose the
		// cockpit. The verb carries the grammar, the fragment carries the content.
		const desks = T10.map((a) => (a.questionId === 'q4w' ? { ...a, keys: ['the-cockpit'] } : a));
		const p = composeHeroPrompt({ futureKey: 'neo-seoul', answers: desks, table: 10 });
		expect(p).not.toMatch(/no fixed desks/);
	});

	it('tells the model not to write on the walls', () => {
		const p = t10();
		for (const term of NO_SIGNAGE_TEXT.split(', ')) {
			expect(p).toContain(term);
		}
	});
});

describe('the frame it is drawn at', () => {
	it('renders 16:9, which is what the phone and the wall lay out for', () => {
		// The ticker passes no aspectRatio, so every render — hero included —
		// takes fal.ts's default. The phone's hero tile and the done screen
		// both size a 16:9 box; if this ever changes, they crop.
		expect(DEFAULT_ASPECT_RATIO).toBe('16:9');
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
		expect(p).toContain('People arrive by clear sightlines');
		expect(p).not.toMatch(/Deep work happens/);
		expect(p).not.toMatch(/They work at/);
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
