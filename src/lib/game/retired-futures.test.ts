/**
 * A WITHDRAWN LENS MUST STILL COMPOSE.
 *
 * The 21 Sep review cut the offered list from six cities to four. Deleting
 * the other two outright would have been the cheap move and the wrong one:
 * unlike an `And:` fragment — one clause that simply stops appearing — a
 * lens carries `styleDna`, `worldOutside`, `lightLine` and
 * `negativeFragment`. A row stored under a deleted key would compose a
 * prompt with no world in it at all and no error anywhere to say so.
 *
 * So the rule has two halves and this file asserts both: nobody may pick a
 * retired lens, and every retired lens still resolves.
 */
import { describe, expect, it } from 'vitest';
import { ALL_FUTURES, FUTURES, RETIRED_FUTURES } from './futures';
import { futureByKey } from '../../routes/t/[table]/layers';

describe('retired futures', () => {
	it('is not offered anywhere a table can tap', () => {
		for (const f of RETIRED_FUTURES) {
			expect(FUTURES.map((o) => o.key)).not.toContain(f.key);
		}
	});

	it('still resolves through futureByKey, whole', () => {
		for (const f of RETIRED_FUTURES) {
			const found = futureByKey(f.key);
			expect(found, f.key).toBeDefined();
			// The four layers a lens supplies. Any one of these coming back
			// empty is the silent degradation this file exists to catch.
			expect(found!.styleDna).toBeTruthy();
			expect(found!.worldOutside).toBeTruthy();
			expect(found!.lightLine).toBeTruthy();
			expect(found!.negativeFragment).toBeTruthy();
		}
	});

	it('leaves ALL_FUTURES as the union, with no key counted twice', () => {
		expect(ALL_FUTURES).toHaveLength(FUTURES.length + RETIRED_FUTURES.length);
		expect(new Set(ALL_FUTURES.map((f) => f.key)).size).toBe(ALL_FUTURES.length);
	});
});
