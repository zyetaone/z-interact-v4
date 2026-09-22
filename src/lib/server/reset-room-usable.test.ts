/**
 * A RESET ROOM MUST BE USABLE, NOT MERELY EMPTY.
 *
 * `reset-completeness.test.ts` proves the DATA half: every row survives and
 * none of it reads back. Both halves passed while the verb was still broken,
 * because the thing that was wrong is not a row.
 *
 * `resetRoom` was a loop over `resetTable`, and a reset watermark is
 * per-table. The room LOCK and the projector BEAT are room-wide and neither
 * moved. So the run that this verb exists to enable — close the room at the
 * end of run one, reset, hand the cards to a new set of tables — ended with
 * twenty phones refused ("the room is closed") and the wall still showing
 * the finale of a room with nothing in it.
 *
 * `clearRoom` had the same shape one level down: it deleted the four content
 * tables and left `room_state`, `table_reopen` and `room_beat` behind, so a
 * reused database remembered a lock and a grant from an event that no longer
 * had a single row in it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeD1 } from './fake-d1';
import { clearRoom, resetRoom } from './archive';
import { getBeat, setBeat } from './beat';
import { grantReopen, lockedAt, mayReopen, setLocked } from './gate';
import { saveAnswer, seedTables } from './room';

const EVENT = 'reset-room-usable';
const TABLES = 4;
let db: D1Database;

beforeEach(async () => {
	db = fakeD1();
	await seedTables(db, EVENT, TABLES);
	await saveAnswer(db, { eventId: EVENT, table: 1, questionId: 'future', keys: ['solarpunk'], actor: 'table', source: 'tap' });
});

describe('resetRoom hands the room back', () => {
	it('opens a room the desk had closed', async () => {
		await setLocked(db, EVENT, true);
		expect(await lockedAt(db, EVENT)).not.toBeNull();

		await resetRoom(db, EVENT, TABLES);

		// This is the assertion the verb was missing. Without it every phone
		// in the second run is refused by `decideSubmit`.
		expect(await lockedAt(db, EVENT)).toBeNull();
	});

	it('sends the wall back to the lobby instead of the finale of a room that is gone', async () => {
		await setBeat(db, EVENT, 'finale', null);
		await resetRoom(db, EVENT, TABLES);

		const beat = await getBeat(db, EVENT);
		expect(beat.beat).toBe('lobby');
		expect(beat.focusTable).toBeNull();
	});

	it('leaves an already-open room open — it is not a toggle', async () => {
		expect(await lockedAt(db, EVENT)).toBeNull();
		await resetRoom(db, EVENT, TABLES);
		expect(await lockedAt(db, EVENT)).toBeNull();
	});
});

describe('clearRoom takes the gate with it', () => {
	it('forgets the lock, the reopen grants and the beat', async () => {
		await setLocked(db, EVENT, true);
		await grantReopen(db, EVENT, 2);
		await setBeat(db, EVENT, 'reveal', null);
		expect(await mayReopen(db, EVENT, 2)).toBe(true);

		const cleared = await clearRoom(db, EVENT);

		expect(await lockedAt(db, EVENT)).toBeNull();
		expect(await mayReopen(db, EVENT, 2)).toBe(false);
		expect((await getBeat(db, EVENT)).beat).toBe('lobby');
		// And it says so, rather than deleting quietly.
		expect(cleared.room_state).toBeGreaterThan(0);
		expect(cleared.table_reopen).toBeGreaterThan(0);
		expect(cleared.room_beat).toBeGreaterThan(0);
	});

	it('does not reach another event on the same database', async () => {
		const OTHER = 'someone-elses-event';
		await setLocked(db, OTHER, true);
		await clearRoom(db, EVENT);
		expect(await lockedAt(db, OTHER)).not.toBeNull();
	});
});
