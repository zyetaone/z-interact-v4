<script lang="ts">
	import { roomLock, setRoomLock } from './admin.remote';
	// ponytail: no auth yet — see admin.remote.ts's module note.

	let lock = $state.raw(await roomLock());
</script>

<h1>Admin</h1>
<p>Room is {lock.closed ? 'closed' : 'open'}.</p>
<button
	onclick={async () => {
		await setRoomLock({ locked: !lock.closed });
		lock = await roomLock();
	}}
>
	{lock.closed ? 'Reopen' : 'Close'} room
</button>
