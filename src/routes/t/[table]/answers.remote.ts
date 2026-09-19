/**
 * Remote functions for `/t/[table]`. `error()`/`redirect()` work inside
 * `query` but NOT inside `command` (verified against current SvelteKit
 * docs, ADR-036 §3) — `saveAnswer` and `finishTable` return a typed
 * `{ ok: false, reason }` instead of throwing.
 *
 * `tableStatus` is also a TICKER (game-flow.md §6/§8): every poll walks
 * this table's non-terminal `image` rows and advances each one exactly one
 * `generate.ts` step via the shared `ticker.ts`. That is what makes a phone
 * that died mid-generation, or a webhook that never arrives, recover for
 * free the next time any phone (or the admin screen, or another webhook
 * delivery) polls — see `admin.remote.ts` and `api/fal-webhook/+server.ts`
 * for the other two tickers.
 */
import * as v from 'valibot';
import { command, query } from '$app/server';
import { requestEnv, eventId, requestWaitUntil, requestOrigin } from '$lib/server/env';
import { TABLE_COUNT } from '$lib/game/questions';
import { ZONES } from '$lib/game/zones';
import { composeLayers } from '$lib/server/prompt';
import { assertCanSubmit } from '$lib/server/gate';
import {
	saveAnswer as saveAnswerRow,
	getTableState,
	getCurrentAnswers,
	finishTable as finishTableRow,
	insertPrompt,
	insertQueuedImage,
	getCurrentImage,
	getPendingImagesForTable
} from '$lib/server/room';
import { createThrottle } from '$lib/server/throttle';
import { tickAndPersist, realGenerateDeps, buildWebhookUrl } from '$lib/server/ticker';

const tableNo = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(TABLE_COUNT));

// One per isolate — best-effort, see throttle.ts's module note.
const throttle = createThrottle();

export const tableStatus = query(v.object({ table: tableNo }), async ({ table }) => {
	const env = requestEnv();
	if (!env) return { table, currentStep: 0, submittedAt: null, closed: false, granted: false };
	const event = eventId(env);
	const state = await getTableState(env.DB, event, table);

	// TICKER: advance any of this table's in-flight generations by one step.
	// TODO(content/plumbing): `prompt` is a placeholder — a real
	// implementation reads the composed text from the `prompt` table by the
	// image row's `promptId` rather than resubmitting a stub string.
	for (const row of await getPendingImagesForTable(env.DB, event, table)) {
		await tickAndPersist(
			env.DB,
			{ id: row.id, state: row.state, falRequestId: row.falRequestId, table, zoneKey: row.zoneKey },
			'TODO(content): prompt',
			realGenerateDeps(env, event, table, row.zoneKey, row.id, buildWebhookUrl(requestOrigin(), env.FAL_WEBHOOK_SECRET, row.id))
		);
	}

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
		text: input.text,
		actor: 'table',
		source: 'tap'
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
		const answers = await getCurrentAnswers(env.DB, event, table);
		const layerInputs = {
			mood: 'TODO(content)',
			materialsAndLight: 'TODO(content)',
			programme: answers.map((a) => a.keys.join(',')).join('; ') || 'TODO(content)',
			feel: 'TODO(content)'
		};

		for (const zone of ZONES) {
			// "If a generation is already in flight, the existing one is
			// returned rather than a second being started" (game-flow §8) —
			// reuse the current attempt instead of queuing a duplicate.
			const existing = await getCurrentImage(env.DB, event, table, zone.key);
			if (existing && existing.state !== 'failed') continue;

			const composed = composeLayers(layerInputs, zone);
			const promptId = await insertPrompt(env.DB, {
				eventId: event,
				table,
				mood: layerInputs.mood,
				material: layerInputs.materialsAndLight,
				programme: layerInputs.programme,
				feel: layerInputs.feel,
				composed,
				actor: 'table'
			});
			const image = await insertQueuedImage(env.DB, {
				eventId: event,
				table,
				zoneKey: zone.key,
				promptId,
				prompt: composed,
				model: 'TODO(content): fal model id',
				actor: 'table',
				supersedesId: existing?.id ?? null
			});

			// waitUntil kicks the first tick; the phone/admin polls and the
			// webhook are the safety net if it's cut short (game-flow §6).
			requestWaitUntil(
				tickAndPersist(
					env.DB,
					{ id: image.id, state: image.state, falRequestId: image.falRequestId, table, zoneKey: zone.key },
					composed,
					realGenerateDeps(env, event, table, zone.key, image.id, buildWebhookUrl(requestOrigin(), env.FAL_WEBHOOK_SECRET, image.id))
				)
			);
		}
	} finally {
		throttle.release(table);
	}

	return { ok: true as const };
});
