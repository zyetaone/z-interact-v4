<script lang="ts">
	import { FUTURES } from '$lib/game/futures';
	import type { TableView } from './types';

	let { tables }: { tables: TableView[] } = $props();

	const futureName = new Map(FUTURES.map((f) => [f.key, f.name]));

	/** First stored zone image, per the brief ("a plain 5x4 grid of each
	 *  table's first stored zone tile") — grouping by future is a later beat. */
	function firstImage(t: TableView) {
		return t.images.find((i) => i.url) ?? null;
	}
</script>

<!-- Reveal beat (game-flow.md §4, tag C): plain 5x4 grid, one tile per table. -->
<section class="reveal">
	<div class="grid">
		{#each tables as t (t.table)}
			{@const img = firstImage(t)}
			<figure class="cell">
				{#if img}
					<img src={img.url} alt="Table {t.table} zone render" loading="lazy" />
				{:else}
					<div class="empty">no image yet</div>
				{/if}
				<figcaption>
					<span class="table-no">{t.table}</span>
					{#if t.futureKey}<span class="future">{futureName.get(t.futureKey) ?? t.futureKey}</span>{/if}
				</figcaption>
			</figure>
		{/each}
	</div>
</section>

<style>
	.reveal {
		height: 100%;
		padding: 2rem;
	}
	.grid {
		height: 100%;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		grid-template-rows: repeat(4, 1fr);
		gap: 0.75rem;
	}
	.cell {
		position: relative;
		margin: 0;
		border-radius: 0.5rem;
		overflow: hidden;
		background: var(--card);
		display: flex;
	}
	.cell img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.empty {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--ink-muted);
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	figcaption {
		position: absolute;
		inset: auto 0 0 0;
		display: flex;
		justify-content: space-between;
		padding: 0.4rem 0.6rem;
		background: linear-gradient(0deg, rgba(0, 0, 0, 0.65), transparent);
		font-size: 0.85rem;
	}
	.table-no {
		font-weight: 700;
	}
	.future {
		color: var(--gold);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 0.7rem;
	}
</style>
