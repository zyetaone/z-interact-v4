<script lang="ts">
	import { roomLock, setRoomLock } from './admin.remote';
	import { poll } from '$lib/poll.svelte';
	// ponytail: no auth yet — see admin.remote.ts's module note.
	// roomLock is also this app's admin-side generation ticker (game-flow.md
	// §6/§8) — polling it here is what makes the admin screen the second of
	// the three tickers, not just a lock-state display.

	let lock = $state.raw(await roomLock());
	const { stale } = poll(4000, async () => {
		lock = await roomLock();
	});
</script>

<h1>Admin</h1>
{#if stale}<p role="alert">stale</p>{/if}
<p>Room is {lock.closed ? 'closed' : 'open'}.</p>
<button
	onclick={async () => {
		await setRoomLock({ locked: !lock.closed });
		lock = await roomLock();
	}}
>
	{lock.closed ? 'Reopen' : 'Close'} room
</button>
