<script lang="ts">
	import { tableStatus } from './answers.remote';

	let { data }: { data: { table: number } } = $props();

	// TODO(content): replace this stub with the 13-screen flow (tone, Q1-11,
	// wildcard) per architecture.md §5. This route currently only proves the
	// table-range guard and the tableStatus query round-trip.
	// svelte-ignore state_referenced_locally -- intentional: `table` seeds the
	// initial poll read once; SvelteKit remounts this component on table-param
	// navigation, so there is no live case where `data.table` changes under it.
	const table = data.table;
	let status = $state.raw(await tableStatus({ table }));
</script>

<h1>Table {data.table}</h1>
<p>Step {status.currentStep} — TODO(content): question screens.</p>
{#if status.submittedAt}
	<p>Submitted.</p>
{/if}
