<script lang="ts">
	/**
	 * REVEAL — BIG PICTURES, PAGED.
	 *
	 * The grid this replaces put all twenty tables on screen at once. At
	 * 1920x1080 that was a quarter of the frame; at 5760x1080 it was a
	 * sliver down the left edge, and the tile a delegate came to see was
	 * roughly a postage stamp at 20 m. It also spent most of its area on
	 * tables that had not rendered yet, drawn as dashed empty boxes.
	 *
	 * So the beat pages instead. A page holds four or five BIG tiles, each
	 * one zone render with its table number over it; the page turns itself
	 * on a timer and crossfades. Only tables with something drawn are in
	 * the rotation: a table that has not rendered is skipped, never shown
	 * as an empty box, because an empty box on the wall reads as a fault.
	 *
	 * Tiles per page is a readability decision, not a layout convenience:
	 *   wide wall — five across one row, each ~1/5 of the frame (~1150 px
	 *               on the venue wall), which is the size the brief asked
	 *               for and the back of the room can actually read.
	 *   16:9      — four as 2x2, each ~half the frame. Five across a 1920
	 *               frame would be 384 px wide, which is the postage stamp
	 *               again under a different arrangement.
	 *
	 * Grouping survives as ORDER and COLOUR only (`grouping.ts`): tables
	 * that argued from the same future page together and carry the same
	 * accent, and no beat prints the future's name.
	 */
	import { fade } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import { accentForFuture } from './tokens';
	import { byLensThenTable, futureIndexOf } from './grouping';
	import type { TableView } from './types';

	let { tables, panels = 1 }: { tables: TableView[]; panels?: number } = $props();

	/** Seconds a page holds the wall. Long enough to find your own table's number and look at the picture. */
	const PAGE_SECONDS = 8;

	const perPage = $derived(panels > 1 ? 5 : 4);

	/** Only tables with a render. Skipping is the whole point — see the note above. */
	const drawn = $derived(byLensThenTable(tables.filter((t) => t.images.some((i) => i.url))));

	const pages = $derived.by(() => {
		const out: TableView[][] = [];
		for (let i = 0; i < drawn.length; i += perPage) out.push(drawn.slice(i, i + perPage));
		return out;
	});

	// Wall-clock paging. Same shape, and the same justification, as
	// `Finale`'s cursor: the page turns with TIME, which is not derivable
	// from any other state, and the timer has to start and stop with the
	// component. The Svelte autofixer flags it; this is the exception the
	// rule leaves room for.
	let cursor = $state(0);

	const pageIndex = $derived(pages.length ? cursor % pages.length : 0);
	const current = $derived(pages[pageIndex] ?? []);

	$effect(() => {
		// `at` is read HERE, in the effect body, and that is the whole point:
		// it makes `cursor` a dependency, so turning a page re-runs this
		// effect and schedules the next turn.
		//
		// It used to be `cursor += 1` inside the callback and nothing read
		// `cursor` in the body. A `setTimeout` callback runs outside the
		// tracking context, so the write was invisible to the effect, the
		// effect never re-ran, and no second timeout was ever scheduled:
		// measured on the fixture wall, the beat advanced from page 1 to
		// page 2 at 8 s and then held page 2 for ever. With twenty tables at
		// four a page that is five pages, of which the room would have seen
		// two. `Finale` has the same shape and survives only by accident —
		// its body reads `turnSeconds`, which derives from `cursor`.
		const at = cursor;
		if (pages.length <= 1) return;
		const id = setTimeout(() => {
			cursor = at + 1;
		}, PAGE_SECONDS * 1000);
		return () => clearTimeout(id);
	});

	/** Transitions do not honour reduced-motion on their own; on the wall a crossfade becomes a cut. */
	const fadeMs = $derived(prefersReducedMotion.current ? 0 : 600);

	function accentFor(t: TableView): string {
		const i = futureIndexOf(t.futureKey);
		return i == null ? 'var(--line)' : accentForFuture(i);
	}

	/**
	 * Which of this table's renders the tile shows. Advancing with the page
	 * cursor means a table seen twice in a long reveal shows a different
	 * room the second time, rather than the same picture on a loop.
	 */
	function tileImage(t: TableView, turn: number) {
		const landed = t.images.filter((i) => i.url);
		return landed[turn % landed.length];
	}

	const turn = $derived(pages.length ? Math.floor(cursor / pages.length) : 0);
</script>

<section class="reveal">
	{#if current.length === 0}
		<p class="waiting">nothing drawn yet</p>
	{:else}
		{#key pageIndex}
			<div class="page" class:wide={panels > 1} in:fade={{ duration: fadeMs }} out:fade={{ duration: fadeMs }}>
				{#each current as t (t.table)}
					{@const img = tileImage(t, turn)}
					<figure class="tile" style:--accent={accentFor(t)}>
						<img src={img.url} alt="Table {t.table}" />
						<figcaption><span class="table-no">{t.table}</span></figcaption>
					</figure>
				{/each}
			</div>
		{/key}
		{#if pages.length > 1}
			<div class="pager" aria-hidden="true">
				{#each pages as _, i (i)}
					<span class="dot" class:on={i === pageIndex}></span>
				{/each}
			</div>
		{/if}
	{/if}
</section>

<style>
	.reveal,
	.reveal * {
		box-sizing: border-box;
	}
	/* The pages stack: the outgoing one is still in the DOM while the
	   incoming one fades up, so the wall never flashes the navy ground
	   between pages. */
	.reveal {
		position: relative;
		height: 100%;
		overflow: hidden;
	}
	/* EXPLICIT ROWS. With columns declared and rows left implicit, a row is
	   sized by its content, and a tile's `height: 100%` image then resolves
	   against `auto` and falls back to the picture's own height. On the last
	   page of a 2x2 — the page that is not full — that showed one tile
	   filling only the top half of its frame with navy beneath, while its
	   neighbours looked right. Both axes are fractions now, and
	   `grid-auto-rows` covers a page that is not full. */
	.page {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		grid-template-rows: repeat(2, 1fr);
		grid-auto-rows: 1fr;
		gap: 1.5vh;
		padding: 2vh 2vh 6vh;
	}
	/* One row across the wall: five tiles, each about a fifth of the frame. */
	.page.wide {
		grid-template-columns: repeat(5, 1fr);
		grid-template-rows: 1fr;
		grid-auto-rows: 1fr;
	}
	.tile {
		position: relative;
		margin: 0;
		min-width: 0;
		min-height: 0;
		border-radius: 0.5rem;
		overflow: hidden;
		background: var(--card);
		box-shadow: inset 0 0 0 2px var(--accent);
	}
	.tile img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	figcaption {
		position: absolute;
		inset: auto 0 0 0;
		padding: 1vh 2vh;
		background: linear-gradient(0deg, rgba(0, 0, 0, 0.75), transparent);
	}
	/* The one thing a delegate needs from across the room: which table. */
	.table-no {
		font-family: 'Playfair Display', Georgia, serif;
		font-size: var(--type-table-no);
		line-height: 1;
		font-weight: 700;
		text-shadow: 0 2px 12px rgba(0, 0, 0, 0.8);
	}
	.pager {
		position: absolute;
		inset: auto 0 2vh 0;
		display: flex;
		justify-content: center;
		gap: 1vh;
	}
	.dot {
		width: 1.2vh;
		height: 1.2vh;
		border-radius: 999px;
		background: var(--line);
	}
	.dot.on {
		background: var(--gold);
	}
	.waiting {
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0;
		color: var(--ink-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: var(--type-body);
	}
</style>
