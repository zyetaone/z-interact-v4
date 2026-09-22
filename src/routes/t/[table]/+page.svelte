<script lang="ts">
	/**
	 * THE TAP FLOW — game-flow.md §1's 18 screens, one component per screen
	 * type, driven by `state/table.svelte.ts`.
	 *
	 * Every tap writes to the server before the screen advances, so the
	 * flow has no client-side progress to lose: `resumeIndex` derives the
	 * step from the stored answers, and a replacement phone on the same URL
	 * lands exactly where the dead one was. A save that fails leaves the
	 * selection on screen with a retry banner and does NOT advance.
	 *
	 * `status` is `$state.raw` — a server snapshot replaced whole, never
	 * mutated. The only `$effect` in this flow is the one inside
	 * `poll.svelte.ts`, mounted by the two screens that poll.
	 */
	import '../../../app.css';
	import { tableStatus, saveAnswer, saveFuture, saveWildcard, finishTable, regenerate,
		undoRender, retryZone } from './answers.remote';
	import { allRendersSettled, createTableState, FLOW_QUESTIONS, type TableStatus } from '$lib/state/table.svelte';
	import { andId } from '$lib/game/questions';
	import Topbar from '$lib/ui/table/Topbar.svelte';
	import LandingScreen from '$lib/ui/table/LandingScreen.svelte';
	import FutureScreen from '$lib/ui/table/FutureScreen.svelte';
	import QuestionScreen from '$lib/ui/table/QuestionScreen.svelte';
	import WildcardScreen from '$lib/ui/table/WildcardScreen.svelte';
	import ReviewScreen from '$lib/ui/table/ReviewScreen.svelte';
	import DrawingScreen from '$lib/ui/table/DrawingScreen.svelte';
	import ImagesScreen from '$lib/ui/table/ImagesScreen.svelte';
	import DoneScreen from '$lib/ui/table/DoneScreen.svelte';

	// `brand` comes from the ROOT layout load, not this route's — see
	// `+layout.server.ts`. A page's own data includes its layout's.
	let { data }: { data: { table: number; brand?: string } } = $props();

	// svelte-ignore state_referenced_locally -- intentional: `table` seeds the
	// first read once; SvelteKit remounts this component on a table-param
	// navigation, so there is no live case where `data.table` changes under it.
	const table = data.table;
	const initial = (await tableStatus({ table })) as TableStatus;
	const flow = createTableState(initial);

	/**
	 * Pull the server's snapshot back in — the one place `status` is
	 * replaced. `refresh()`, not a bare re-await: a query is cached by its
	 * arguments, so `await tableStatus({ table })` hands back the value
	 * already on the client and the 2s poll would never reach the server,
	 * never run the ticker, and never see an image arrive.
	 *
	 * `await q`, NOT `q.current`. In the fidelity run a table sat on "Being
	 * drawn" for a full minute after all four renders had landed, and a
	 * fresh navigation showed them immediately. The cause is in kit's own
	 * query instance: `current` is a `$derived` over the raw value, while
	 * `refresh()` resolves as soon as the fetch lands — it does not await a
	 * Svelte `tick()`. Reading `current` in the same microtask therefore
	 * hands back the PREVIOUS value, so every poll wrote a snapshot one
	 * round behind. The query's own `then` does `.then(tick).then(() =>
	 * current)`, which is exactly the wait that was missing, so awaiting the
	 * query is both simpler and correct.
	 */
	async function refresh() {
		const q = tableStatus({ table });
		await q.refresh();
		flow.status = (await q) as TableStatus;
	}

	let saving = $state(false);
	let failed = $state('');

	/** Draft edits live here only between a tap and its save landing. */
	let draftKeys = $state<Record<string, string[]>>({});
	let draftTexts = $state<Record<string, Record<string, string>>>({});
	let draftPush = $state<Record<string, string>>({});
	/** The "And:" pick per question id — `null` once the table un-picks it. */
	let draftAnd = $state<Record<string, string | null>>({});
	let draftWildcard = $state<string | null>(null);
	let draftPrompt = $state<string | null>(null);

	function keysOf(id: string): string[] {
		return draftKeys[id] ?? flow.answer(id)?.keys ?? [];
	}
	function textsOf(id: string): Record<string, string> {
		return draftTexts[id] ?? flow.answer(id)?.text ?? {};
	}
	function pushOf(id: string): string {
		return draftPush[id] ?? flow.answer(id)?.pushReply ?? '';
	}
	function andOf(id: string): string | null {
		return id in draftAnd ? draftAnd[id] : (flow.answer(andId(id))?.keys[0] ?? null);
	}

	/**
	 * The question's own row, then its "And:" row when the question has one.
	 * The sub-question is optional, so an empty pick still writes `[]` — that
	 * is how an un-pick clears an earlier row (latest row wins, `room.ts`).
	 */
	async function saveQuestion(id: string) {
		const saved = await saveAnswer({
			table,
			questionId: id,
			keys: keysOf(id),
			text: textsOf(id),
			pushReply: pushOf(id)
		});
		if (!saved.ok || !question?.and) return saved;
		const key = andOf(id);
		return saveAnswer({ table, questionId: andId(id), keys: key ? [key] : [] });
	}

	/** One shape for every write: block, report, and only advance on success. */
	async function run(work: () => Promise<{ ok: boolean; reason?: string }>, advance = true) {
		saving = true;
		failed = '';
		try {
			const result = await work();
			if (!result.ok) {
				failed = result.reason ?? 'That did not save. Tap again.';
				return false;
			}
			await refresh();
			if (advance) flow.next();
			return true;
		} catch {
			failed = 'That did not save — your answer is still on this phone. Tap again.';
			return false;
		} finally {
			saving = false;
		}
	}

	const current = $derived(flow.step);
	const question = $derived(
		current.kind === 'question' ? FLOW_QUESTIONS.find((q) => q.id === current.id) : undefined
	);
	const answersById = $derived(new Map(flow.status.answers.map((a) => [a.questionId, a])));
	const wildcardText = $derived(
		draftWildcard ?? flow.answer('wildcard')?.text?.['wildcard-open'] ?? ''
	);
	const promptText = $derived(draftPrompt ?? flow.status.prompt);

	/* EVERY STEP STARTS AT THE TOP. The flow swaps components on state, never
	   on navigation, so the browser keeps scrollTop and SvelteKit's own scroll
	   restoration never fires: a table tapping Next at the foot of one tile
	   grid lands mid-grid on the next question with the stem off-screen,
	   eleven times. The key is the step identity, not the object, so a
	   re-render of the same step does not yank the page. Focus moves to the
	   new heading so a screen reader announces the question. */
	const stepKey = $derived(current.kind === 'question' ? `q:${current.id}` : current.kind);
	$effect(() => {
		stepKey;
		if (typeof window === 'undefined') return;
		window.scrollTo(0, 0);
		const stem = document.querySelector<HTMLElement>('main.phone h1.stem');
		if (!stem) return;
		// A heading is not focusable on its own; -1 makes it a programmatic
		// target without putting it in the tab order.
		stem.tabIndex = -1;
		stem.focus({ preventScroll: true });
	});
</script>

<svelte:head><title>Table {table}</title></svelte:head>

<main class="phone">
	<Topbar {table} progress={flow.progress} />

	{#if current.kind === 'landing'}
		<LandingScreen
			{table}
			resuming={flow.status.answers.length > 0}
			closed={flow.status.closed}
			gateReason={flow.status.gateReason}
			onbegin={() => flow.resume()}
		/>
	{:else if current.kind === 'future'}
		<FutureScreen
			futureKey={flow.status.future}
			onpick={(key) => run(() => saveFuture({ table, futureKey: key }), false)}
			onskip={() => run(() => saveFuture({ table, futureKey: null }))}
			onnext={() => flow.next()}
		/>
	{:else if current.kind === 'question' && question}
		<QuestionScreen
			{question}
			keys={keysOf(question.id)}
			texts={textsOf(question.id)}
			pushReply={pushOf(question.id)}
			{saving}
			{failed}
			onchange={(keys, texts) => {
				draftKeys = { ...draftKeys, [question.id]: keys };
				draftTexts = { ...draftTexts, [question.id]: texts };
			}}
			onpush={(text) => (draftPush = { ...draftPush, [question.id]: text })}
			onnext={() => run(() => saveQuestion(question.id))}
		/>
	{:else if current.kind === 'wildcard'}
		<WildcardScreen
			text={wildcardText}
			{saving}
			onchange={(text) => (draftWildcard = text)}
			onadd={() => run(() => saveWildcard({ table, text: wildcardText }))}
			onskip={() => flow.next()}
		/>
	{:else if current.kind === 'review'}
		<ReviewScreen
			answers={answersById}
			prompt={promptText}
			editable={flow.status.promptEditable}
			missing={flow.missing}
			canSubmit={flow.status.canSubmit}
			gateReason={flow.status.gateReason}
			{saving}
			onprompt={(text) => (draftPrompt = text)}
			onedit={(key) => flow.go(key)}
			onsubmit={async () => {
				// Never send an edit the renderer would throw away: in a hero
				// room `composePromptFor` ignores it, so sending it only writes
				// a misleading `editedByTable: true` on the prompt row.
				const edited =
					flow.status.promptEditable && draftPrompt && draftPrompt !== flow.status.prompt
						? draftPrompt
						: undefined;
				if (await run(() => finishTable({ table, composed: edited }), false)) flow.go('drawing');
			}}
		/>
	{:else if current.kind === 'drawing'}
		<DrawingScreen
			brand={data.brand}
			prompt={flow.status.prompt}
			images={flow.status.images}
			refresh={async () => {
				await refresh();
				// Advance when the renders have ANSWERED, not only when one
				// succeeded. A table whose whole set failed has nothing left to
				// wait for, and *Draw again* only exists on the next screen —
				// which is how a failed table sat on "Being drawn" for ever.
				if (flow.status.images.some((i) => i.url) || allRendersSettled(flow.status)) flow.go('images');
			}}
		/>
	{:else if current.kind === 'images'}
		<ImagesScreen
			prompt={flow.status.prompt}
			images={flow.status.images}
			regenerating={saving}
			narrative={flow.status.narrative}
			{failed}
			{refresh}
			onregenerate={(steer) => run(() => regenerate({ table, steer }), false)}
			canUndo={flow.status.canUndo}
			onundo={() => run(() => undoRender({ table }), false)}
			onretry={(zone) => run(() => retryZone({ table, zone }), false)}
			ondone={() => flow.go('done')}
		/>
	{:else}
		<!-- `onedit` goes to REVIEW, not to the first question. It used to send a
		     submitted table back to the lens and make it walk all five screens
		     again, re-answering what it had already answered. The review screen
		     lists every answer and its own edit jumps to the ONE line tapped,
		     which is what this button meant all along. -->
		<DoneScreen
			closed={flow.status.closed}
			gateReason={flow.status.gateReason}
			images={flow.status.images}
			narrative={flow.status.narrative}
			onedit={() => flow.go('review')}
			onimages={() => flow.go('images')}
		/>
	{/if}

	{#if flow.canGoBack}
		<div class="back-row">
			<button class="btn quiet" onclick={() => flow.back()}>&larr; Back</button>
		</div>
	{/if}
</main>

<style>
	.back-row {
		padding-top: 12px;
	}
</style>
