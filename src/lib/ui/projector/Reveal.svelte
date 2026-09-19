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

	/** No tile AND nothing still coming: the render failed, which the wall says
	 *  plainly rather than showing the same "no image yet" a queued table shows. */
	function hasFailed(t: TableView): boolean {
		return (
			!t.images.some((i) => i.url) &&
			t.images.length > 0 &&
			t.images.every((i) => i.state === 'failed' || i.state === 'stored' || i.state === 'done') &&
			t.images.some((i) => i.state === 'failed')
		);
	}
</script>

<!-- Reveal beat (game-flow.md §4, tag C): plain 5x4 grid, one tile per table. -->
<section class="reveal">
	<header>Every table</header>
	<div class="grid">
		{#each tables as t (t.table)}
			{@const img = firstImage(t)}
			{@const failed = hasFailed(t)}
			<figure class="cell" class:empty-cell={!img} class:failed-cell={failed}>
				{#if img}
					<img src={img.url} alt="Table {t.table} zone render" loading="lazy" />
				{:else if failed}
					<div class="empty failed">didn't land</div>
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
	/* box-sizing:border-box throughout — the previous `height:100%` +
	   content-box padding combination pushed the border box past the
	   viewport (overflow silently clipped by the projector root's
	   `overflow:hidden`), which is why row 4 (tables 16-20) went missing at
	   1920x1080. Flex column + `flex:1` + `min-height:0` on `.grid` (not
	   `height:100%`) is what actually keeps 20 tiles inside one screen with
	   no page scroll, ever. */
	.reveal,
	.reveal * {
		box-sizing: border-box;
	}
	.reveal {
		height: 100%;
		display: flex;
		flex-direction: column;
		padding: 1.25rem 2rem 2rem;
		gap: 0.75rem;
	}
	header {
		flex: 0 0 auto;
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-muted);
	}
	.grid {
		flex: 1;
		min-height: 0;
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
		min-height: 0;
	}
	.cell img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	/* Quieter than a drawn tile, on purpose — the eye should land on what
	   exists, not on the 20-tile placeholder grid around it. */
	.cell.empty-cell {
		background: transparent;
		border: 1px dashed var(--line);
		opacity: 0.55;
	}
	/* A failed render is a different fact from "not drawn yet" — dashed-and-
	   faint reads as waiting, so failure gets its own border and colour. */
	.cell.failed-cell {
		border-style: solid;
		border-color: #e0475c;
		opacity: 0.8;
	}
	.empty.failed {
		color: #e0475c;
	}
	.empty {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--ink-muted);
		font-size: 0.8rem;
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
	.empty-cell figcaption {
		background: none;
	}
	.table-no {
		font-weight: 700;
	}
	.empty-cell .table-no {
		font-weight: 500;
		color: var(--ink-muted);
	}
	.future {
		color: var(--gold);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-size: 0.7rem;
	}
</style>
