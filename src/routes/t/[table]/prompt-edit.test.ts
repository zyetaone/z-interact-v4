/**
 * THE REVIEW SCREEN'S TEXTAREA DOES NOTHING IN THE DEFAULT ROOM.
 *
 * `ZONE_SET` defaults to `hero` (zones.ts, owner decision 20 Sep), and
 * `composePromptFor` answers a hero zone with `composeHeroPrompt(answers)`
 * — it never reads `ctx.composed`. So a table that rewrites the prompt on
 * screen 15 has its rewrite validated, sanitized, written to the `prompt`
 * row with `editedByTable: true`, shown back on the review screen, carried
 * into the export... and ignored by the thing that draws the picture.
 *
 * `hero.ts` flagged this as "a product call, flagged rather than taken
 * here". This file does not take the call either — it pins the BEHAVIOUR,
 * so that whichever way the call goes, it goes deliberately. If someone
 * later makes the hero honour an edit, these tests fail and say so.
 *
 * The screen has since been changed to collapse the prompt and present it
 * read-only wherever it cannot take effect, which is what makes the stored
 * `editedByTable` flag reachable only from a room that actually uses it.
 */
import { describe, expect, it } from 'vitest';
import { composePromptFor } from './hero';
import { HERO_ZONE, ZONE_SETS, zoneSetFrom } from '$lib/game/zones';

const ANSWERS = [
	{ questionId: 'q8', keys: ['saturated'] },
	{ questionId: 'q5c', keys: ['glass-dome'] },
	{ questionId: 'q6r', keys: ['water-room'] },
	{ questionId: 'q2', keys: ['warm-earthy'] }
];

const ctx = (composed: string) => ({
	composed,
	negative: 'collage, grid',
	answers: ANSWERS,
	futureKey: 'garden-city',
	era: null,
	table: 4
});

const REWRITE = 'A single red telephone box in an empty white room, nothing else at all.';

describe('a table-edited prompt under the default zone set', () => {
	it('the default really is hero — the premise of everything below', () => {
		expect(zoneSetFrom(undefined)).toBe('hero');
		expect(zoneSetFrom('nonsense')).toBe('hero');
	});

	it('is discarded: the hero composes from the answers, not the textarea', () => {
		const drawn = composePromptFor(HERO_ZONE, ctx(REWRITE));
		expect(drawn).not.toContain('red telephone box');
		// And it is not simply empty — the answers are all there.
		expect(drawn).toContain('greenery threaded through the entire floor');
		expect(drawn).toContain('glass geodesic room');
	});

	it('is byte-identical whether the table rewrote it or never touched it', () => {
		expect(composePromptFor(HERO_ZONE, ctx(REWRITE))).toBe(composePromptFor(HERO_ZONE, ctx('')));
	});

	it('IS honoured on the four-zone path, which is why the field exists at all', () => {
		const zone = ZONE_SETS.book[0];
		const drawn = composePromptFor(zone, ctx(REWRITE));
		expect(drawn).toContain('red telephone box');
	});
});
