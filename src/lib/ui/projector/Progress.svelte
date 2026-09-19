<script lang="ts">
	import { FUTURES } from '$lib/game/futures';
	import { LENS_IMAGE } from '$lib/game/visuals';
	import { accentForFuture, BEAT_LABEL } from './tokens';
	import type { TableView } from './types';

	let { tables, wide = false }: { tables: TableView[]; wide?: boolean } = $props();

	const futureIndex = new Map(FUTURES.map((f, i) => [f.key, i]));

	function accentFor(futureKey: string | null): string | null {
		if (!futureKey) return null;
		const i = futureIndex.get(futureKey);
		return i == null ? null : accentForFuture(i);
	}

	/** The chosen lens as a dimmed backdrop — the picture, never the name: the
	 *  lens is hidden analysis (Lobby's note), so no text names it here. */
	function backdrop(futureKey: string | null): string | null {
		if (!futureKey || !(futureKey in LENS_IMAGE)) return null;
		return `linear-gradient(rgba(22, 35, 58, 0.72), rgba(22, 35, 58, 0.72)), url(${LENS_IMAGE[futureKey as keyof typeof LENS_IMAGE]})`;
	}

	function label(t: TableView): string {
		if (t.beatState === 'answering' && t.step != null) return `answering ${t.step} of ${t.totalSteps}`;
		return BEAT_LABEL[t.beatState] ?? t.beatState;
	}

	const counts = $derived.by(() => {
		const c = new Map<string, number>();
		for (const t of tables) c.set(t.beatState, (c.get(t.beatState) ?? 0) + 1);
		return c;
	});
</script>

<!-- Progress beat (game-flow.md §4, tag C): 20 tiles, one per table, state + future colour once chosen. -->
<section class="progress" class:wide>
	<h2>In the room</h2>
	<div class="grid">
		{#each tables as t (t.table)}
			<div
				class="cell"
				class:done={t.beatState === 'done'}
				style:--accent={accentFor(t.futureKey) ?? 'var(--line)'}
				style:background-image={backdrop(t.futureKey)}
			>
				<span class="table-no">{t.table}</span>
				<span class="state">{label(t)}</span>
			</div>
		{/each}
	</div>
	<p class="summary">
		{#each [...counts] as [state, n], i (state)}{i > 0 ? ' · ' : ''}{n} {BEAT_LABEL[state] ?? state}{/each}
	</p>
</section>

<style>
	/* border-box, not content-box: `height:100%` plus content-box padding
	   pushes the border box past the viewport (silently clipped by the
	   projector root's `overflow:hidden`) — the same bug fixed in
	   Reveal.svelte, hardened here before it shows up the same way. */
	.progress,
	.progress * {
		box-sizing: border-box;
	}
	.progress {
		height: 100%;
		display: flex;
		flex-direction: column;
		padding: 2rem 3rem 2.5rem;
		gap: 1.25rem;
	}
	h2 {
		font-family: 'Playfair Display', Georgia, serif;
		font-size: var(--type-heading);
		line-height: 1;
		margin: 0;
		font-weight: 600;
	}
	.grid {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		grid-template-rows: repeat(4, 1fr);
		gap: 1rem;
	}
	/* Twenty tiles across a 5.3:1 wall: two rows of ten, so a tile stays
	   close to 16:9 instead of becoming a tall sliver. */
	.progress.wide .grid {
		grid-template-columns: repeat(10, 1fr);
		grid-template-rows: repeat(2, 1fr);
	}
	.cell {
		border: 1px solid var(--accent);
		border-radius: 0.5rem;
		background: var(--card-alpha);
		background-size: cover;
		background-position: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		box-shadow: inset 0 0 0 2px transparent;
		text-shadow: 0 1px 6px rgba(0, 0, 0, 0.7);
	}
	.cell.done {
		box-shadow: inset 0 0 0 2px var(--accent);
	}
	.table-no {
		font-family: 'Playfair Display', Georgia, serif;
		font-size: var(--type-table-no);
		line-height: 1;
	}
	.state {
		font-size: var(--type-caption);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-muted);
	}
	.summary {
		margin: 0;
		text-align: center;
		color: var(--ink-muted);
		font-size: var(--type-caption);
		letter-spacing: 0.03em;
	}
</style>
