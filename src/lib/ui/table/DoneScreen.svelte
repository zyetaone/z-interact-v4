<script lang="ts">
	/** Screen 18 — in, and waiting. Edit stays open until the room locks. */
	let {
		closed,
		gateReason,
		onedit,
		onimages
	}: { closed: boolean; gateReason: string; onedit: () => void; onimages: () => void } = $props();
</script>

<h1 class="stem">You're in. Watch the screen.</h1>
<p class="hint">Your four rooms are with the rest of them now.</p>

{#if closed}
	<p class="banner calm">{gateReason || 'Answers are closed — the screen has moved on.'}</p>
{/if}

<div class="grow"></div>

<div class="actions">
	<button class="btn ghost" onclick={onimages}>See ours again</button>
	<button class="btn" disabled={closed} onclick={onedit}>
		{closed ? 'Answers are closed' : 'Edit our answers'}
	</button>
</div>
