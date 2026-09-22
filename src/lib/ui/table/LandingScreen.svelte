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
<!-- A SPACER EACH SIDE, so the title and its button sit together in the
     middle of the screen.

     Every OTHER screen in this app pins its actions to the bottom, which is
     right when there is content above them competing for the thumb. This
     screen has no content: it is one line and one button, and the
     bottom-pinned pattern pushed them to opposite ends of a tall phone with
     a void between — the title read as a header and the button as unrelated
     furniture. Two `.grow`s centre the pair instead. -->
<div class="grow"></div>

<h1 class="stem title">The Survival Adventure</h1>

{#if closed}
	<p class="banner">{gateReason || 'Answers are closed and the screen has moved on. The desk can reopen this table.'}</p>
{/if}

<div class="actions near">
	<button class="btn" disabled={closed} onclick={onbegin}>
		{resuming ? 'Pick up where you left off' : 'Start here'}
	</button>
</div>

<div class="grow"></div>

<style>
	/* No `margin-top` any more — the spacer above does that job, and a fixed
	   8vh fought it on every screen height. */
	.title {
		text-align: center;
		margin: 0;
	}

	/* Close under the title rather than a screen away from it. */
	.actions.near {
		margin-top: 28px;
	}
</style>
