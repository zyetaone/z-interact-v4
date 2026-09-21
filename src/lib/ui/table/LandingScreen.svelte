<script lang="ts">
	/** Screen 2 — table identity, where this table is, and one way in. */
	let {
		table,
		resuming,
		closed,
		gateReason,
		onbegin
	}: { table: number; resuming: boolean; closed: boolean; gateReason: string; onbegin: () => void } = $props();
</script>

<!-- THE TITLE AND A BUTTON. 21 Sep 19:24: "this will change to 'the
     survival adventure', all other text on top will disappear, below that
     a start button".

     The cognitive city is not lost with the paragraph that used to name it:
     screen one now ASKS it ("How do you imagine your future cognitive
     city?", `futures.ts`'s LENS_STEM), which is a better place for a frame
     than a paragraph nobody reads standing up in a loud room. -->
<h1 class="stem title">The Survival Adventure</h1>

{#if closed}
	<p class="banner">{gateReason || 'Answers are closed and the screen has moved on. The desk can reopen this table.'}</p>
{/if}

<div class="grow"></div>

<div class="actions">
	<button class="btn" disabled={closed} onclick={onbegin}>
		{resuming ? 'Pick up where you left off' : 'Start here'}
	</button>
</div>

<style>
	/* The screen is one line and one button now, so the title carries it. */
	.title {
		margin-top: 8vh;
	}

	/* The name of the experience, above its one-line promise — 21 Sep
	   minutes §1. Small and gold rather than a second headline: the stem is
	   still what the table reads first. */
</style>
