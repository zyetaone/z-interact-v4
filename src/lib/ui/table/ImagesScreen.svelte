<script lang="ts">
	/**
	 * Screen 17 — the four zone images as they arrive, the prompt beneath,
	 * and *Draw again*. Zero images is not a blank screen: the prompt is
	 * shown with the line game-flow.md §1 specifies.
	 */
	import { poll } from '$lib/poll.svelte';

	let {
		prompt,
		images,
		regenerating,
		refresh,
		onregenerate,
		ondone
	}: {
		prompt: string;
		images: { zoneKey: string; state: string; url: string | null; error: string | null }[];
		regenerating: boolean;
		refresh: () => Promise<unknown>;
		onregenerate: () => void;
		ondone: () => void;
	} = $props();

	const beat = poll(2000, () => refresh());
	const arrived = $derived(images.filter((i) => i.url));
</script>

<h1 class="stem">Your workspace.</h1>

{#if beat.stale}
	<p class="banner">No answer from the room for {beat.staleSeconds}s — this may not be the latest.</p>
{/if}

{#if arrived.length === 0}
	<p class="banner">The drawing didn't land — the desk can redraw this table.</p>
{:else}
	<ul class="gallery">
		{#each images as image (image.zoneKey)}
			<li>
				{#if image.url}
					<img src={image.url} alt="Our {image.zoneKey}" />
				{:else}
					<div class="pending">{image.state === 'failed' ? 'did not land' : 'still drawing'}</div>
				{/if}
				<span class="zone">{image.zoneKey}</span>
			</li>
		{/each}
	</ul>
{/if}

<section class="ours">
	<span class="field-label">What we asked for</span>
	<p class="prompt">{prompt}</p>
</section>

<div class="grow"></div>

<div class="actions">
	<button class="btn ghost" disabled={regenerating} onclick={onregenerate}>
		{regenerating ? 'Redrawing…' : 'Draw again'}
	</button>
	<button class="btn" onclick={ondone}>We're done</button>
</div>

<style>
	.gallery {
		list-style: none;
		margin: 0 0 22px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.gallery li {
		position: relative;
		border-radius: var(--radius);
		overflow: hidden;
		border: 1px solid var(--line);
	}

	.gallery img {
		display: block;
		width: 100%;
		aspect-ratio: 3 / 2;
		object-fit: cover;
	}

	.pending {
		display: flex;
		align-items: center;
		justify-content: center;
		aspect-ratio: 3 / 2;
		background: var(--card);
		color: var(--ink-faint);
		font-size: 13px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.zone {
		position: absolute;
		left: 12px;
		bottom: 10px;
		font-family: var(--display);
		font-size: 17px;
		text-transform: capitalize;
		text-shadow: 0 1px 8px rgba(0, 0, 0, 0.8);
	}

	.prompt {
		font-size: 13px;
		line-height: 1.55;
		color: var(--ink-dim);
		margin: 0;
	}
</style>
