<script lang="ts">
	import { FUTURES } from '$lib/game/futures';
	import { accentForFuture, BEAT_LABEL } from './tokens';
	import type { TableView } from './types';

	let { tables }: { tables: TableView[] } = $props();

	const futureIndex = new Map(FUTURES.map((f, i) => [f.key, i]));

	function accentFor(futureKey: string | null): string | null {
		if (!futureKey) return null;
		const i = futureIndex.get(futureKey);
		return i == null ? null : accentForFuture(i);
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
<section class="progress">
	<h2>In the room</h2>
	<div class="grid">
		{#each tables as t (t.table)}
			<div class="cell" class:done={t.beatState === 'done'} style:--accent={accentFor(t.futureKey) ?? 'var(--line)'}>
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
	.progress {
		height: 100%;
		display: flex;
		flex-direction: column;
		padding: 3rem 4rem;
		gap: 1.5rem;
	}
	h2 {
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 2.25rem;
		margin: 0;
		font-weight: 600;
	}
	.grid {
		flex: 1;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		grid-template-rows: repeat(4, 1fr);
		gap: 1rem;
	}
	.cell {
		border: 1px solid var(--accent);
		border-radius: 0.5rem;
		background: var(--card-alpha);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		box-shadow: inset 0 0 0 2px transparent;
	}
	.cell.done {
		box-shadow: inset 0 0 0 2px var(--accent);
	}
	.table-no {
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 2rem;
	}
	.state {
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-muted);
	}
	.summary {
		margin: 0;
		text-align: center;
		color: var(--ink-muted);
		font-size: 1rem;
		letter-spacing: 0.03em;
	}
</style>
