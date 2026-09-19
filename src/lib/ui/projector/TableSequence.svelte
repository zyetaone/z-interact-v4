<script lang="ts">
	import { accentForFuture, ZONE_STEP_SECONDS } from './tokens';
	import { futureIndexOf } from './grouping';
	import type { TableView } from './types';

	let { table, panels = 1 }: { table: TableView; panels?: number } = $props();

	const STEP_SECONDS = ZONE_STEP_SECONDS;

	// The lens is hidden analysis: it may tint the wall, it may never name
	// itself on it. A colour is the whole of what the room gets.
	const accent = $derived.by(() => {
		const i = futureIndexOf(table.futureKey);
		return i == null ? 'var(--line)' : accentForFuture(i);
	});

	/** Only zones with a stored image cycle — an unrendered zone would
	 *  otherwise hold an empty slot in the loop for its whole turn. */
	const shown = $derived(table.images.filter((i) => i.url));
	const loopSeconds = $derived(Math.max(shown.length, 1) * STEP_SECONDS);

	/**
	 * ONE PANEL PER 16:9 THE FRAME HOLDS.
	 *
	 * A zone render is 16:9. Stretching one across a 5.3:1 stage and
	 * cropping to fill throws away two thirds of every picture — the wall
	 * would show the middle strip of a room and nothing else. So the wide
	 * wall gets a triptych: each panel runs the same crossfade one zone
	 * out of step with its neighbour, so the room sees three of this
	 * table's four zones at once and the set still turns over.
	 */
	const panelOffsets = $derived(Array.from({ length: Math.max(1, panels) }, (_, k) => k));
</script>

<!-- Per-table sequence (zones-and-video.md §3(a)): client-side Ken Burns
     pan+crossfade across a table's stored zone tiles. No rendering
     pipeline, no video file — pure CSS, reuses images already on screen
     elsewhere in the finale. -->
<section class="sequence" style:--loop="{loopSeconds}s" style:--accent={accent}>
	<header>
		<span class="table-no">Table {table.table}</span>
		<span class="lens-band" aria-hidden="true"></span>
	</header>
	<div class="stage">
		{#if shown.length === 0}
			<div class="empty">no zones drawn yet</div>
		{/if}
		{#each panelOffsets as offset (offset)}
			<div class="panel">
				{#each shown as img, i (img.zone)}
					<img
						src={img.url}
						alt="Table {table.table} — {img.zone}"
						loading="lazy"
						style:animation-delay="{-((i + offset) * STEP_SECONDS)}s"
					/>
				{/each}
			</div>
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
		font-size: var(--type-table-no);
		line-height: 1;
	}
	/* The lens as a colour band. Never as a word: naming the future on the
	   wall would hand the room the analysis it is supposed to arrive at. */
	.lens-band {
		flex: 0 0 auto;
		width: 12vh;
		height: 1.2vh;
		border-radius: 999px;
		background: var(--accent);
	}
	.stage {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		gap: 0.75rem;
	}
	.panel {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
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
		font-size: var(--type-caption);
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
