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

<h1 class="stem">Draw the workspace your table would actually want.</h1>
<hr class="rule" />
<p class="hint">
	Eleven questions, one screen each. Answer as a table, not as yourself. Nothing is saved on this
	phone — pick it up on another one and you will be exactly here.
</p>

{#if closed}
	<p class="banner">{gateReason || 'Answers are closed and the screen has moved on. The desk can reopen this table.'}</p>
{/if}

<div class="grow"></div>

<div class="actions">
	<button class="btn" disabled={closed} onclick={onbegin}>
		{resuming ? 'Continue' : 'Begin'}
	</button>
</div>
