/**
 * Remote functions for `/t/[table]`. `error()`/`redirect()` work inside
 * `query` but NOT inside `command` (verified against current SvelteKit
 * docs, ADR-036 §3) — `saveAnswer` and `finishTable` return a typed
 * `{ ok: false, reason }` instead of throwing.
 */
import * as v from 'valibot';
import { command, query } from '$app/server';
import { requestEnv, eventId } from '$lib/server/env';
import { TABLE_COUNT } from '$lib/game/questions';
import { ZONES } from '$lib/game/zones';
import { composeLayers } from '$lib/server/prompt';
import { assertCanSubmit } from '$lib/server/gate';
import { saveAnswer as saveAnswerRow, getTableState, getTableAnswers, finishTable as finishTableRow } from '$lib/server/room';
import { createThrottle } from '$lib/server/throttle';
import { submitZoneImage } from '$lib/server/fal';

const tableNo = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(TABLE_COUNT));

// One per isolate — best-effort, see throttle.ts's module note.
const throttle = createThrottle();

export const tableStatus = query(v.object({ table: tableNo }), async ({ table }) => {
	const env = requestEnv();
	if (!env) return { table, currentStep: 0, submittedAt: null, closed: false, granted: false };
	const event = eventId(env);
	const state = await getTableState(env.DB, event, table);
	return {
		table,
		currentStep: state.currentStep,
		submittedAt: state.submittedAt,
		closed: false,
		granted: false
	};
});

const SaveAnswerInput = v.object({
	table: tableNo,
	questionId: v.string(),
	keys: v.array(v.string()),
	text: v.optional(v.record(v.string(), v.string()))
});

export const saveAnswer = command(SaveAnswerInput, async (input) => {
	const env = requestEnv();
	if (!env) return { ok: false as const, reason: 'no environment' };
	const event = eventId(env);
	await saveAnswerRow(env.DB, {
		eventId: event,
		table: input.table,
		questionId: input.questionId,
		keys: input.keys,
		text: input.text
	});
	return { ok: true as const };
});

const FinishTableInput = v.object({ table: tableNo });

export const finishTable = command(FinishTableInput, async ({ table }) => {
	const env = requestEnv();
	if (!env) return { ok: false as const, reason: 'no environment' };
	const event = eventId(env);

	const state = await getTableState(env.DB, event, table);
	const decision = await assertCanSubmit(env.DB, event, table, !!state.submittedAt);
	if (!decision.ok) return { ok: false as const, reason: decision.reason };

	if (!throttle.acquire(table)) {
		return { ok: false as const, reason: 'This table is already submitting — hang tight.' };
	}
	try {
		await finishTableRow(env.DB, event, table);

		// TODO(content): LayerInputs.mood/materialsAndLight/programme/feel are
		// derived from the chosen future + answers. Stubbed here so the
		// pipeline runs end-to-end before the content workstreams land.
		const answers = await getTableAnswers(env.DB, event, table);
		const layerInputs = {
			mood: 'TODO(content)',
			materialsAndLight: 'TODO(content)',
			programme: answers.map((a) => a.keys.join(',')).join('; ') || 'TODO(content)',
			feel: 'TODO(content)'
		};

		if (env.FAL_KEY) {
			for (const zone of ZONES) {
				const prompt = composeLayers(layerInputs, zone);
				const requestKey = `${table}:${zone.key}:${state.rev}`;
				// TODO(content/infra): resolve the real fal model id per env, and
				// skip re-submit when a prompts/images row already exists for
				// (event, table, zone, rev) — the UNIQUE constraint in room.ts's
				// IMAGES_SCHEMA is the backstop, this is the fast-path check.
				await submitZoneImage({
					falKey: env.FAL_KEY,
					model: 'TODO(content): fal model id',
					prompt,
					requestKey,
					retentionSeconds: 60 * 60 * 24
				}).catch((e) => {
					console.log(`[finishTable] fal submit failed for table ${table} zone ${zone.key}: ${String(e).slice(0, 200)}`);
				});
			}
		}
	} finally {
		throttle.release(table);
	}

	return { ok: true as const };
});
