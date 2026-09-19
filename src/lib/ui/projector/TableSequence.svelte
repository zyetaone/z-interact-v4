<script lang="ts">
	import { FUTURES } from '$lib/game/futures';
	import { ZONE_STEP_SECONDS } from './tokens';
	import type { TableView } from './types';

	let { table }: { table: TableView } = $props();

	const futureName = new Map(FUTURES.map((f) => [f.key, f.name]));
	const STEP_SECONDS = ZONE_STEP_SECONDS;

	/** Only zones with a stored image cycle — an unrendered zone would
	 *  otherwise hold an empty slot in the loop for its whole turn. */
	const shown = $derived(table.images.filter((i) => i.url));
	const loopSeconds = $derived(Math.max(shown.length, 1) * STEP_SECONDS);
</script>

<!-- Per-table sequence (zones-and-video.md §3(a)): client-side Ken Burns
     pan+crossfade across a table's stored zone tiles. No rendering
     pipeline, no video file — pure CSS, reuses images already on screen
     elsewhere in the finale. -->
<section class="sequence" style:--loop="{loopSeconds}s">
	<header>
		<span class="table-no">Table {table.table}</span>
		{#if table.futureKey}<span class="future">{futureName.get(table.futureKey) ?? table.futureKey}</span>{/if}
	</header>
	<div class="stage">
		{#if shown.length === 0}
			<div class="empty">no zones drawn yet</div>
		{/if}
		{#each shown as img, i (img.zone)}
			<img
				src={img.url}
				alt="Table {table.table} — {img.zone}"
				loading="lazy"
				style:animation-delay="{-(i * STEP_SECONDS)}s"
			/>
		{/each}
	</div>
</section>

<style>
	.sequence {
		height: 100%;
		display: flex;
		flex-direction: column;
		padding: 2rem;
		gap: 1rem;
	}
	header {
		display: flex;
		align-items: baseline;
		gap: 1rem;
	}
	.table-no {
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 2rem;
	}
	.future {
		color: var(--gold);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-size: 1rem;
	}
	.stage {
		position: relative;
		flex: 1;
		border-radius: 0.75rem;
		overflow: hidden;
		background: var(--card);
	}
	.stage img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0;
		animation-name: kenburns;
		animation-duration: var(--loop);
		animation-iteration-count: infinite;
		animation-timing-function: ease-in-out;
	}
	.empty {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--ink-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	@keyframes kenburns {
		0% {
			opacity: 0;
			transform: scale(1) translate(0, 0);
		}
		2% {
			opacity: 1;
		}
		23% {
			opacity: 1;
			transform: scale(1.08) translate(-1.5%, 1.5%);
		}
		25% {
			opacity: 0;
		}
		100% {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.stage img {
			animation-name: kenburns-static;
		}
		@keyframes kenburns-static {
			0% {
				opacity: 0;
				transform: none;
			}
			2% {
				opacity: 1;
			}
			23% {
				opacity: 1;
				transform: none;
			}
			25% {
				opacity: 0;
			}
			100% {
				opacity: 0;
			}
		}
	}
</style>
