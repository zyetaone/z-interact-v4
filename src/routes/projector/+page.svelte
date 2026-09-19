<script lang="ts">
	import { getRoomSnapshot } from './gallery.remote';
	import { poll } from '$lib/poll.svelte';
	// TODO(content): gallery grouped by future, per-table zone sequence
	// (architecture.md §8 stretch bucket). This route is a stub proving the
	// poll loop against a real remote function.

	let room = $state.raw(await getRoomSnapshot());
	const { stale } = poll(2000, async () => {
		room = await getRoomSnapshot();
	});
</script>

<h1>Projector</h1>
{#if stale}<p role="alert">stale</p>{/if}
<ul>
	{#each room.tables as t (t.table)}
		<li>Table {t.table}: {t.submittedAt ? 'done' : `step ${t.currentStep}`}</li>
	{/each}
</ul>
