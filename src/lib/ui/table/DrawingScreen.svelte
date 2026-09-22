<script lang="ts">
	/**
	 * Screen 16 — the table's own prompt, a line per zone, and a poll.
	 *
	 * The poll lives in THIS component rather than the page so the interval
	 * exists only while the screen does. Three missed reads raise the stale
	 * banner (`poll.svelte.ts`'s rule, ported from presence): the last good
	 * snapshot stays on screen, because a stale line is indistinguishable
	 * from a true one unless the screen says so.
	 */
	import { poll } from '$lib/poll.svelte';
	import { generationLine } from './generation-line';

	let {
		prompt,
		images,
		refresh
	}: {
		prompt: string;
		images: { zoneKey: string; state: string; url: string | null; error: string | null }[];
		refresh: () => Promise<unknown>;
	} = $props();

	const beat = poll(2000, () => refresh());

</script>

<h1 class="stem">Being drawn.</h1>
<p class="hint">A couple of minutes. Put the phone down.</p>

{#if beat.stale}
	<p class="banner">
		No answer from the room for {beat.staleSeconds}s — this is the last thing we heard, not
		necessarily the latest.
	</p>
{/if}

<ul class="zones">
	{#each images as image (image.zoneKey)}
		<li class:failed={image.state === 'failed'}>
			<span class="zone">{image.zoneKey}</span>
			<span class="state">{generationLine(image.state)}</span>
		</li>
	{/each}
</ul>


<div class="grow"></div>

<style>
	.zones {
		list-style: none;
		margin: 0 0 24px;
		padding: 0;
		border-top: 1px solid var(--line);
	}

	.zones li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 15px 2px;
		border-bottom: 1px solid var(--line);
		font-size: 15px;
	}

	.zone {
		font-family: var(--display);
		font-size: 18px;
		text-transform: capitalize;
	}

	.state {
		font-size: 12px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--teal);
	}

	.zones li.failed .state {
		color: var(--warn);
	}

</style>
