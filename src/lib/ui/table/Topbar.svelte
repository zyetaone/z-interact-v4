<script lang="ts">
	/** Table identity and where this table is in the run — game-flow.md §1, screen 2 onward. */
	let { table, progress = '' }: { table: number; progress?: string } = $props();
</script>

<header class="topbar">
	<span class="table-no">Table {table}</span>
	{#if progress}<span class="progress">{progress}</span>{/if}
</header>
