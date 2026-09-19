<script lang="ts">
	/**
	 * FINALE (game-flow.md §4, beat 5) — every table's four-zone sequence in
	 * turn, on a timer, so the room watches the whole set without anyone
	 * touching the desk. Reuses `TableSequence` rather than restating its
	 * crossfade, so the two beats cannot drift apart visually.
	 *
	 * Only tables with something drawn are cycled: an empty slot holding the
	 * screen for its whole turn is the one thing a finale must not do.
	 */
	import TableSequence from './TableSequence.svelte';
	import { ZONE_STEP_SECONDS } from './tokens';
	import type { TableView } from './types';

	let { tables, secondsPerTable }: { tables: TableView[]; secondsPerTable?: number } = $props();

	const shown = $derived(tables.filter((t) => t.images.some((i) => i.url)));

	// An $effect assigning state is usually a smell, and the Svelte autofixer
	// flags this one. It is the exception the rule leaves room for: the cursor
	// advances with WALL-CLOCK TIME, which is not derivable from any other
	// state, and the timer genuinely is a side effect that has to start and
	// stop with the component. Same shape as poll.svelte.ts, the only other
	// $effect in this tree.
	let cursor = $state(0);

	const current = $derived(shown.length ? shown[cursor % shown.length] : null);

	/**
	 * A table holds the screen for its WHOLE sequence. `TableSequence` loops at
	 * one zone per `ZONE_STEP_SECONDS`, so a fixed 12 s turn showed the first
	 * two of four zones and cut away before the rest ever appeared.
	 */
	const turnSeconds = $derived(
		secondsPerTable ?? Math.max(1, current?.images.filter((i) => i.url).length ?? 1) * ZONE_STEP_SECONDS
	);

	$effect(() => {
		if (shown.length <= 1) return;
		const id = setTimeout(() => {
			cursor += 1;
		}, turnSeconds * 1000);
		return () => clearTimeout(id);
	});
</script>

<section class="finale">
	{#if current}
		{#key current.table}
			<TableSequence table={current} />
		{/key}
		<footer>
			<span>{(cursor % shown.length) + 1} of {shown.length}</span>
		</footer>
	{:else}
		<div class="waiting">nothing drawn yet</div>
	{/if}
</section>

<style>
	.finale,
	.finale * {
		box-sizing: border-box;
	}
	.finale {
		position: relative;
		height: 100%;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.finale :global(section.sequence) {
		flex: 1;
		min-height: 0;
	}
	footer {
		position: absolute;
		right: 2rem;
		bottom: 1.25rem;
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
	.waiting {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--ink-muted);
		font-size: 1rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
</style>
