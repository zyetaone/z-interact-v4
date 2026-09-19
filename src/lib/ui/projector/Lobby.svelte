<script lang="ts">
	import { FUTURES } from '$lib/game/futures';
	import { accentForFuture } from './tokens';

	let { eventTitle }: { eventTitle: string } = $props();
</script>

<!-- Lobby beat (game-flow.md §4, tag C): title, thesis, futures strip, no QR — tent cards carry the QR. -->
<section class="lobby">
	<div class="rule"></div>
	<h1>{eventTitle}</h1>
	<p class="thesis">Twenty tables. Seven futures. One workspace, drawn twenty ways.</p>
	<ul class="futures">
		{#each FUTURES as future, i (future.key)}
			<li style:--dot={accentForFuture(i)}>{future.name}</li>
		{/each}
	</ul>
	<p class="cue">Scan the card on your table to begin.</p>
</section>

<style>
	.lobby {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
		text-align: center;
		padding: 4rem;
	}
	.rule {
		width: 6rem;
		height: 3px;
		background: var(--gold);
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
	.futures {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.75rem 1.5rem;
		margin: 1rem 0 0;
		padding: 0;
		font-size: 1.1rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.futures li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.futures li::before {
		content: '';
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--dot);
	}
	.cue {
		margin-top: 2.5rem;
		font-size: 1.25rem;
		color: var(--gold);
		letter-spacing: 0.04em;
	}
</style>
