<script lang="ts">
	/**
	 * REVEAL, GROUPED BY LENS (game-flow.md §4, beat 3: "every table's
	 * overview image, **grouped by future**"). A flat 5x4 grid said nothing
	 * about the argument the room had just had; a band per future says who
	 * argued for what, which is the point of the beat.
	 *
	 * Bands, not columns: the futures are unevenly chosen (three tables may
	 * pick Solarpunk and none pick Broadacre), and equal columns would give a
	 * one-table future the same width as a six-table one. A band sized to its
	 * own contents keeps the tiles the same size across the wall.
	 */
	import { FUTURES } from '$lib/game/futures';
	import { accentForFuture } from './tokens';
	import type { TableView } from './types';

	let { tables }: { tables: TableView[] } = $props();

	const futureName = new Map(FUTURES.map((f) => [f.key, f.name]));

	/** One band per future that actually has tables, in the palette's own order, with anything unchosen last. */
	const bands = $derived.by(() => {
		const byKey = new Map<string, TableView[]>();
		for (const t of tables) {
			const key = t.futureKey ?? '';
			const held = byKey.get(key);
			if (held) held.push(t);
			else byKey.set(key, [t]);
		}
		const out: { key: string; label: string; accent: string | null; tables: TableView[] }[] = [];
		FUTURES.forEach((f, i) => {
			const group = byKey.get(f.key);
			if (group?.length) out.push({ key: f.key, label: f.name, accent: accentForFuture(i), tables: group });
		});
		const undecided = byKey.get('');
		if (undecided?.length) out.push({ key: '', label: 'still choosing', accent: null, tables: undecided });
		return out;
	});

	/** The tile this table shows in the grid: its first zone image that landed. */
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

<!-- Reveal beat (game-flow.md §4, tag C): one band per future, tiles inside it. -->
<section class="reveal">
	<header>Every table, by the future it argued from</header>
	<div class="bands">
		{#each bands as band (band.key)}
			<section class="band" style:--accent={band.accent ?? 'var(--line)'}>
				<h3>
					<span class="lens">{band.label}</span>
					<span class="count">{band.tables.length}</span>
				</h3>
				<div class="row">
					{#each band.tables as t (t.table)}
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
	/* Bands share the height in proportion to how many tables each holds, so
	   a six-table future is taller than a one-table one and every TILE ends up
	   roughly the same size. `min-height: 0` on both axes is what keeps 20
	   tiles inside one 1920x1080 screen with no page scroll — the same trap
	   the note above records. */
	.bands {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.band {
		flex: 1 1 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding-left: 0.6rem;
		border-left: 3px solid var(--accent);
	}
	.band h3 {
		flex: 0 0 auto;
		margin: 0;
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--accent);
	}
	.band .count {
		color: var(--ink-muted);
		font-weight: 400;
		letter-spacing: 0.06em;
	}
	.row {
		flex: 1;
		min-height: 0;
		display: flex;
		gap: 0.6rem;
	}
	.row .cell {
		flex: 0 1 auto;
		aspect-ratio: 4 / 3;
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
