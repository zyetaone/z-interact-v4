<script lang="ts">
	import { FUTURES } from '$lib/game/futures';
	import { LENS_IMAGE } from '$lib/game/visuals';
	import type { TableView } from './types';

	let { eventTitle, tables = [] }: { eventTitle: string; tables?: TableView[] } = $props();

	/** One backdrop panel per lens some table has already picked, in palette
	 *  order, deduped — the room sees its own choices as pictures, never as a
	 *  list of names (the lens is hidden analysis). Empty before anyone picks. */
	const picked = $derived.by(() => {
		const keys = new Set(tables.map((t) => t.futureKey).filter((k): k is string => !!k));
		return FUTURES.filter((f) => keys.has(f.key)).map((f) => ({ key: f.key, src: LENS_IMAGE[f.key] }));
	});
</script>

<!-- Lobby beat (game-flow.md §4, tag C): title, thesis, no QR — tent cards carry the QR.
     The seven futures are a lens each table picks on its own phone, not a headline the
     room reads here — kept off the lobby by design. -->
<section class="lobby">
	{#if picked.length}
		<div class="backdrop" aria-hidden="true">
			{#each picked as p (p.key)}
				<img src={p.src} alt="" loading="lazy" />
			{/each}
		</div>
	{/if}
	<div class="rule"></div>
	<h1>{eventTitle}</h1>
	<p class="thesis">Each table draws the workspace of 2035 through its own lens.</p>
	<p class="cue">Scan the card on your table to begin.</p>
</section>

<style>
	.lobby {
		position: relative;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
		text-align: center;
		padding: 4rem;
	}
	.backdrop {
		position: absolute;
		inset: 0;
		z-index: -1;
		display: flex;
		opacity: 0.22;
		mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 1) 50%, rgba(0, 0, 0, 0.6));
	}
	.backdrop img {
		flex: 1 1 0;
		min-width: 0;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.rule {
		position: relative;
		width: 6rem;
		height: 3px;
		background: var(--gold);
	}
	h1,
	.thesis,
	.cue {
		position: relative;
	}
	h1 {
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 4.5rem;
		font-weight: 600;
		margin: 0;
		letter-spacing: 0.01em;
	}
	.thesis {
		font-size: 1.5rem;
		color: var(--ink-muted);
		margin: 0;
		max-width: 40ch;
	}
	.cue {
		margin-top: 2.5rem;
		font-size: 1.25rem;
		color: var(--gold);
		letter-spacing: 0.04em;
	}
</style>
