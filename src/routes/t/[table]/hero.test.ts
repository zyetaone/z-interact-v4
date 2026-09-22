/**
 * The hero prompt's four risks: an answer that silently never arrives, a
 * frame that outgrows its budget, the lens leaking its internal key onto a
 * paid render, and the lens dragging a time of day in with it.
 *
 * The last one is not hypothetical. `futures.ts` keeps `moodLine` (which
 * opens "Night, high above a vertical megacity") apart from `worldOutside`
 * / `styleDna` / `insideCue` / `lightLine` precisely so a lens survives
 * daylight. Since the 21 Sep cut it is `lightLine` — not q11's feel words,
 * which are gone — that owns the light. A hero prompt that reached for
 * `moodLine` instead would put every neo-seoul table in the dark whatever
 * they answered.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { composeHeroPrompt, composePromptFor, DARK_FEEL_KEYS, EXPOSURE, HERO_WORD_TARGET, UNDEREXPOSED_NEGATIVE, NO_SIGNAGE_TEXT, wantsBrightExposure } from './hero';
import { wordCount, wildcardFragment, ERA_YEAR, type AnswerLike } from './layers';
import { ALL_FUTURES, FUTURES } from '$lib/game/futures';
import { QUESTIONS, TABLE_COUNT, WILDCARD } from '$lib/game/questions';
import { HERO_ZONE, IMPOSSIBLE_IDEAS, impossibleIdea, vantageFor, VANTAGES } from '$lib/game/zones';
import { NO_TEXT } from '$lib/server/prompt';
import { ERA_SCALE } from '$lib/game/era';
import { DEFAULT_ASPECT_RATIO } from '$lib/server/fal';

/**
 * The fragment as the CONTENT file defines it. Assertions here used to pin
 * option fragments by retyping them, and they broke every time an option's
 * wording was corrected — each time reporting a bug in the composer, which
 * there wasn't. What the assertion MEANS is "the chosen option's fragment
 * reaches the prompt", so it asks questions.ts what that fragment is.
 */
function fragmentFor(questionId: string, optionKey: string): string {
	const o = QUESTIONS.find((q) => q.id === questionId)?.options.find((x) => x.key === optionKey);
	if (!o) throw new Error(`no such option: ${questionId}/${optionKey}`);
	return o.promptFragment;
}

/** Table 10's rehearsal answers — the set the scratch sample is composed from. */
const T10: AnswerLike[] = [
	{ questionId: 'future', keys: ['neo-seoul'] },
	{ questionId: 'q1', keys: ['hyperfuturistic-2040'] },
	{ questionId: 'q2', keys: ['soft-pastel'] },
	{ questionId: 'q5c', keys: ['glass-dome'] },
	{ questionId: 'q6r', keys: ['igloo'] },
	{ questionId: 'q8', keys: ['saturated'] },
	// A V4-era row. It still composes — see `layers.test.ts`'s note.
	{ questionId: 'q7', keys: ['light-and-sound'] }
];

const t10 = () => composeHeroPrompt({ futureKey: 'neo-seoul', answers: T10, table: 10 });

/**
 * THE ERA CHIP IS GONE FROM THE SCREEN, SO THE LENS HAS TO CARRY THE YEAR.
 *
 * Removed 22 Sep: it was a fifth control on a screen whose job is to pick a
 * city, and the era it set is already a property of the city — `eraDefault`
 * on every future. What must NOT have gone with it is the year itself: the
 * hero's opening clause is "Design a workplace that is relevant in <year>",
 * and an empty year there would read as a broken sentence on every table.
 *
 * `hero.ts` resolves era as `input.era ?? q1's stored key ?? eraDefault`, so
 * a table that never touches an era — which is now every table — still gets
 * its lens's own. `/simulate` still drives `saveEra`, and a `q1` row saved
 * before today still wins over the default, which is why the second test is
 * here rather than deleted.
 */
describe('the year survives the era chip', () => {
	it('takes the lens default when no era was ever stored', () => {
		for (const future of FUTURES) {
			const p = composeHeroPrompt({ futureKey: future.key, era: null, table: 3, answers: [] });
			const year = ERA_YEAR[future.eraDefault];
			expect(p, future.key).toContain(`relevant in ${year}`);
			// Never an empty or slug-shaped year — the failure this guards.
			expect(year, future.key).toBeTruthy();
			expect(year, future.key).not.toMatch(/-/);
		}
	});

	it('still honours a stored q1 row over the lens default', () => {
		const p = composeHeroPrompt({
			futureKey: 'garden-city',
			era: null,
			table: 3,
			answers: [{ questionId: 'q1', keys: ['hyperfuturistic-2040'] }]
		});
		expect(p).toContain(`relevant in ${ERA_YEAR['hyperfuturistic-2040']}`);
	});
});

describe('every answer reaches the hero prompt', () => {
	it('carries each surviving act and the frame that holds them', () => {
		const p = t10();
		// TWO acts now, not four. The 21 Sep minutes cut q3 (arrival) and
		// folded q4w (the workstation) into q5c, so deep work and recharge are
		// the whole programme.
		expect(p).toMatch(/Deep work happens as a glass geodesic room standing alone/);
		expect(p).toContain(`They recharge in ${fragmentFor('q6r', 'igloo')}`);
	});

	it('carries the room participating, nature, the materials, the scale and the lens light', () => {
		const p = t10();
		// q7 arrives as its ROOM_PARTICIPATES clause, not as its option fragment.
		expect(p).toContain('a wall brightens toward whoever walks to it and dims behind them');
		expect(p).toContain(fragmentFor('q8', 'saturated')); // q8
		expect(p).toContain('blush, sage and butter'); // q2
		// The feel is the LENS's `lightLine` now that q11 is cut.
		expect(p).toContain(ALL_FUTURES.find((f) => f.key === 'neo-seoul')!.lightLine);
	});

	it('carries the lens world, the indoor cue, the impossible idea and the era year', () => {
		const p = t10();
		const neoSeoul = ALL_FUTURES.find((f) => f.key === 'neo-seoul')!;
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


describe('the room came back dark', () => {
	/**
	 * q11 — the feel words — is CUT. The light now belongs to the lens, as
	 * `futures.ts`'s `lightLine`, so the guards that used to walk q11's
	 * options walk the six lenses instead. `DARK_FEEL_KEYS` survives as the
	 * knob that can opt a key out again; it is empty and the tests below say
	 * so out loud rather than passing vacuously.
	 */
	const BRIGHT = /\b(sun|sunlit|daylight|bright|light)\b/i;
	const DARK = /\b(night|dusk|evening|twilight|unlit|gloom|dim|darkness)\b/i;

	it('states the exposure for every lens, and with no lens at all', () => {
		expect(t10()).toContain(EXPOSURE);
		for (const future of FUTURES) {
			expect(composeHeroPrompt({ futureKey: future.key, answers: T10, table: 5 }), future.key).toContain(EXPOSURE);
		}
		// And with no lens at all, where the house window is its own source of murk.
		expect(composeHeroPrompt({ answers: T10, table: 5 })).toContain(EXPOSURE);
	});

	it('gives every lens a lightLine that places light rather than removing it', () => {
		// The audit that closed the owner's "all are looking very dark". The
		// same guard `layers.test.ts` holds over the zone prompts, held here
		// because the hero reads the same field.
		expect(DARK_FEEL_KEYS).toEqual([]);
		for (const future of FUTURES) {
			expect(future.lightLine, future.key).toMatch(BRIGHT);
			expect(future.lightLine, future.key).not.toMatch(DARK);
		}
	});

	it('carries the lens lightLine into the prompt, so the guard above is not theoretical', () => {
		for (const future of FUTURES) {
			const p = composeHeroPrompt({ futureKey: future.key, answers: T10, table: 6 });
			expect(p, future.key).toContain(future.lightLine);
		}
	});

	it('still suppresses when a key IS listed, so the knob is not decoration', () => {
		expect(wantsBrightExposure(['alive'], ['alive'])).toBe(false);
		expect(wantsBrightExposure(['alive'], ['quiet'])).toBe(true);
	});

	it('lets no fragment anywhere call a space unlit', () => {
		// A material answer may be near-black and a prop may be a dark glass
		// slab — those are things, and the table chose them. What no fragment
		// may do is declare a SPACE to have no light in it, because that is the
		// whole frame. Two got through my own audit and came from the other
		// session: the threshold that reacts to no one, and the sealed cell.
		for (const q of QUESTIONS) {
			for (const o of q.options ?? []) {
				expect(o.promptFragment ?? '', `${q.id}/${o.key}`).not.toMatch(/\bunlit\b/i);
			}
		}
	});

	it('decides from the keys alone, so the rule can be read without composing a prompt', () => {
		expect(wantsBrightExposure([])).toBe(true);
		expect(wantsBrightExposure(['alive', 'effortless', 'yours'])).toBe(true);
		expect(wantsBrightExposure(['alive', 'quiet'])).toBe(true);
		expect(wantsBrightExposure(['alive', 'quiet'], ['quiet'])).toBe(false);
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
		expect(p).toContain('Deep work happens as');
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
				{ questionId: 'q6r', keys: ['igloo'] }
			],
			table: 2
		});
		expect(p).toMatch(/They recharge in/);
		expect(p).not.toMatch(/Deep work happens/);
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

describe('the exposure negatives', () => {
	it('says it from both sides for a table that did not ask for the dark', () => {
		expect(t10()).toContain(UNDEREXPOSED_NEGATIVE);
	});

	it('carries the negatives on every lens, since nothing opts out today', () => {
		// `DARK_FEEL_KEYS` is the only opt-out left and it is empty, so every
		// lens in the room gets the negative half of the brightening too.
		for (const future of FUTURES) {
			const p = composeHeroPrompt({ futureKey: future.key, answers: T10, table: 3 });
			expect(p, future.key).toContain(UNDEREXPOSED_NEGATIVE);
		}
	});

	it('never says night, which the day-neutral guard forbids', () => {
		expect(UNDEREXPOSED_NEGATIVE).not.toMatch(/\bnight\b/i);
	});
});

describe('every submit path uses the chooser', () => {
	// composePromptFor's own note names five submit paths that must agree.
	// The desk's regenerate did not: it called composeZonePrompt directly, so
	// a hero table repaired from the desk was drawn from the generic base and
	// lost its vantage, its impossible idea and the exposure clause. Redraw is
	// the repair tool, so that was the render most likely to happen live.
	const SUBMITTERS = [
		'src/routes/t/[table]/answers.remote.ts',
		'src/routes/admin/admin.remote.ts'
	];

	it('leaves no direct composeZonePrompt call in a submit path', () => {
		for (const rel of SUBMITTERS) {
			const src = readFileSync(join(process.cwd(), rel), 'utf8');
			const direct = src
				.split('\n')
				.map((line, i) => [i + 1, line] as const)
				.filter(([, line]) => /(?<!compose)\bcomposeZonePrompt\s*\(/.test(line));
			expect(direct.map(([n, l]) => `${rel}:${n} ${l.trim()}`)).toEqual([]);
		}
	});

	it('the hero zone routes to the hero composer, whoever asks', () => {
		const ctx = { composed: '', negative: '', answers: T10, futureKey: 'neo-seoul', era: null, table: 7 };
		expect(composePromptFor(HERO_ZONE, ctx)).toBe(
			composeHeroPrompt({ futureKey: 'neo-seoul', era: null, answers: T10, table: 7 })
		);
	});
});

describe('the wildcard — the answer that was collected and never drawn', () => {
	/**
	 * THE DEFECT, from the 21 Sep end-to-end review. `composeBase` (the
	 * four-zone path) has always carried the wildcard. This composer did
	 * not — and `ZONE_SET` defaults to `hero`, so this composer is the ONLY
	 * prompt most rooms render. The phone's last screen meanwhile promises
	 * "whatever it is, it goes into the drawing exactly as you write it".
	 */
	const TYPED = 'a brass diving bell hanging over the atrium';
	const withWildcard = (text: string) =>
		composeHeroPrompt({
			futureKey: 'neo-seoul',
			answers: [...T10, { questionId: WILDCARD.id, keys: [WILDCARD.options[0].key], text: { [WILDCARD.options[0].key]: text } }],
			table: 10
		});

	it('carries the table\'s own words into the prompt', () => {
		expect(withWildcard(TYPED)).toContain(TYPED);
	});

	it('puts them last of the content, immediately before the Avoid list', () => {
		const p = withWildcard(TYPED);
		expect(p.indexOf(TYPED)).toBeLessThan(p.indexOf('Avoid: '));
		// And after the dressing, so nothing the table typed is buried mid-brief.
		expect(p.indexOf(TYPED)).toBeGreaterThan(p.indexOf('People small and anonymous'));
	});

	it('adds nothing at all when the table skipped it', () => {
		expect(withWildcard('')).toBe(t10());
		expect(withWildcard('   ')).toBe(t10());
	});

	it('strips control characters and collapses whitespace, since this is the one string a stranger typed', () => {
		const p = withWildcard('a brass\u0007 diving   bell\nover the atrium');
		expect(p).toContain('a brass diving bell over the atrium');
		expect(p).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/);
	});

	it('reads the same wildcard the four-zone path reads, from the one reader', () => {
		// Not a second copy of "what the wildcard is" — `wildcardFragment` is
		// exported from layers.ts and both composers call it.
		const by = new Map([[WILDCARD.id, { questionId: WILDCARD.id, keys: [WILDCARD.options[0].key], text: { [WILDCARD.options[0].key]: TYPED } }]]);
		expect(withWildcard(TYPED)).toContain(wildcardFragment(by)!);
	});

	it('stays under the word ceiling with the longest wildcard a table can type', () => {
		// 140 is the cap valibot applies at save time.
		const longest = 'x'.repeat(140);
		for (const future of FUTURES) {
			const p = composeHeroPrompt({
				futureKey: future.key,
				answers: [...T10, { questionId: WILDCARD.id, keys: [WILDCARD.options[0].key], text: { [WILDCARD.options[0].key]: longest } }],
				table: 10
			});
			expect(wordCount(p), future.key).toBeLessThanOrEqual(HERO_WORD_TARGET.max);
		}
	});
});

describe('the era reads as a sentence, whichever chip the table holds', () => {
	/**
	 * `ERA_YEAR['retro-1930s']` was `'1930s-revival'`, which composed
	 * "Design a workplace that is relevant in 1930s-revival". Smoke test 1
	 * drew it on its first table, because `retro-1930s` is Neo Retro's
	 * `eraDefault` — every table on that lens got it unless they nudged the
	 * chip. Three of the four values are years and always read; this is the
	 * guard for the one that is not.
	 */
	it('composes "relevant in <something that reads>" for every era on the scale', () => {
		for (const era of ERA_SCALE) {
			const p = composeHeroPrompt({ futureKey: 'retrofuturism', era, answers: T10, table: 3 });
			const opening = p.slice(0, p.indexOf(':'));
			expect(opening, era).toMatch(/relevant in (a reimagined 1930s|20\d\d)\b/);
			// A bare slug would have a hyphen in it where prose does not.
			expect(/relevant in [a-z0-9]+-[a-z0-9]/.test(opening), era).toBe(false);
		}
	});
});
