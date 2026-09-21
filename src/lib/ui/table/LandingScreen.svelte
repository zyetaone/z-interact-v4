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

<p class="eyebrow">Survival Adventure</p>
<h1 class="stem">Draw the workspace your table would actually want.</h1>
<hr class="rule" />
<!-- The cognitive city is named HERE, before the first question, rather than
     explained at the third. The 21 Sep note asked how the centaur framework
     weaves into it: the city is the frame, and q5c's lead is the human half
     of it — what a table keeps for itself once the building thinks. -->
<p class="hint">
	You are designing inside a <b>cognitive city</b>. Six screens. Answer as a table.
</p>

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
	/* The name of the experience, above its one-line promise — 21 Sep
	   minutes §1. Small and gold rather than a second headline: the stem is
	   still what the table reads first. */
	.eyebrow {
		margin: 0 0 6px;
		font-size: 13px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--gold);
	}
</style>
