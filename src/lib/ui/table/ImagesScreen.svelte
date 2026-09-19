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
		failed,
		refresh,
		onregenerate,
		ondone
	}: {
		prompt: string;
		images: { zoneKey: string; state: string; url: string | null; error: string | null }[];
		regenerating: boolean;
		/** Why the last *Draw again* was refused — the throttle's own words, not a generic line. */
		failed: string;
		refresh: () => Promise<unknown>;
		onregenerate: () => void;
		ondone: () => void;
	} = $props();

	const beat = poll(2000, () => refresh());
	const arrived = $derived(images.filter((i) => i.url));
	const failedZones = $derived(images.filter((i) => i.state === 'failed'));
	/** The provider's own words for the first failure, trimmed — a table that knows WHY can tell the desk. */
	const failureReason = $derived(failedZones.find((i) => i.error)?.error?.slice(0, 160) ?? '');
	/** Nothing landed AND nothing is still coming — the one case where *Draw again* is the only way forward. */
	const allFailed = $derived(arrived.length === 0 && failedZones.length > 0);
</script>

<h1 class="stem">Your workspace.</h1>

{#if failed}
	<p class="banner">{failed}</p>
{/if}

{#if beat.stale}
	<p class="banner">No answer from the room for {beat.staleSeconds}s — this may not be the latest.</p>
{/if}

{#if allFailed}
	<p class="banner">The drawing failed — draw again.</p>
	{#if failureReason}<p class="reason">{failureReason}</p>{/if}
{:else if images.length === 0}
	<p class="banner">The drawing didn't land — the desk can redraw this table.</p>
{/if}

{#if images.length > 0}
	<ul class="gallery">
		{#each images as image (image.zoneKey)}
			<li>
				{#if image.url}
					<img src={image.url} alt="Our {image.zoneKey}" />
				{:else}
					<div class="pending" class:failed={image.state === 'failed'}>
						{image.state === 'failed' ? 'this one failed' : 'still drawing'}
					</div>
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

	.pending.failed {
		color: var(--warn);
	}

	/* Quiet: the table needs the sentence above, and the desk needs this one. */
	.reason {
		margin: -10px 0 18px;
		font-size: 12px;
		line-height: 1.5;
		color: var(--ink-faint);
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
