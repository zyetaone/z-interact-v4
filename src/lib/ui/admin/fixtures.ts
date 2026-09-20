/**
 * FIXTURES — 20 fake table rows in mixed states, behind `?fixtures=1`, so
 * the mission-control screen renders with no D1 at all. Mirrors
 * `projector/fixtures.ts`'s approach: round-robin the six futures, cycle a
 * handful of representative states so every state has multiple examples.
 */
import { FUTURES } from '$lib/game/futures';
import { activeZones } from '$lib/game/zones';
import { QUESTIONS } from '$lib/game/questions';
import type { AdminRoom, AdminTableRow, ZoneImageState } from './types';

const TOTAL_STEPS = QUESTIONS.length;
const NOW = Date.now();

interface FixtureState {
	step: number;
	submitted: boolean;
	images: ZoneImageState[];
	granted: boolean;
	activityAgoMs: number;
}

/**
 * The desk fixture shows what the room will show — the `ZONE_SET` default,
 * since a client-side constant cannot read the server's variable. The
 * four-length state arrays below are sliced to it, so a one-image room
 * still gets a queued, a requested, a stored and a failed example.
 */
const FIXTURE_ZONES = activeZones(undefined);

const STATE_CYCLE: FixtureState[] = [
	{ step: 0, submitted: false, images: FIXTURE_ZONES.map(() => 'none' as const), granted: false, activityAgoMs: 9 * 60_000 },
	{ step: 4, submitted: false, images: FIXTURE_ZONES.map(() => 'none' as const), granted: false, activityAgoMs: 40_000 },
	{ step: TOTAL_STEPS, submitted: true, images: ['queued', 'queued', 'none', 'none'], granted: false, activityAgoMs: 15_000 },
	{ step: TOTAL_STEPS, submitted: true, images: ['requested', 'stored', 'queued', 'none'], granted: false, activityAgoMs: 8_000 },
	{ step: TOTAL_STEPS, submitted: true, images: ['stored', 'stored', 'stored', 'stored'], granted: false, activityAgoMs: 120_000 },
	{ step: TOTAL_STEPS, submitted: true, images: ['failed', 'stored', 'stored', 'stored'], granted: false, activityAgoMs: 200_000 },
	{ step: 2, submitted: false, images: FIXTURE_ZONES.map(() => 'none' as const), granted: true, activityAgoMs: 25_000 },
	{ step: TOTAL_STEPS, submitted: true, images: ['stored', 'stored', 'stored', 'stored'], granted: false, activityAgoMs: 600_000 }
];

function buildTable(table: number): AdminTableRow {
	const future = FUTURES[(table - 1) % FUTURES.length];
	const state = STATE_CYCLE[(table - 1) % STATE_CYCLE.length];
	const images = state.images.slice(0, FIXTURE_ZONES.length);
	const imagesStored = images.filter((s) => s === 'stored' || s === 'done').length;
	return {
		table,
		futureKey: state.step > 0 ? future.key : null,
		step: state.step,
		totalSteps: TOTAL_STEPS,
		submittedAt: state.submitted ? NOW - state.activityAgoMs - 5_000 : null,
		images,
		imageErrors: images.map((s) => (s === 'failed' ? 'fal: 422 content_policy_violation' : null)),
		imagesStored,
		lastActivityAt: NOW - state.activityAgoMs,
		granted: state.granted
	};
}

export const FIXTURE_ROOM: AdminRoom = {
	closed: false,
	beat: 'progress',
	focusTable: null,
	seeded: true,
	zoneKeys: FIXTURE_ZONES.map((z) => z.key),
	tables: Array.from({ length: 20 }, (_, i) => buildTable(i + 1))
};
