<script lang="ts">
	/**
	 * ADMIN MISSION CONTROL — one screen, one poll (game-flow.md §5, §8).
	 * ponytail: no real auth — `token` is a shared secret carried on the
	 * hidden URL (`?token=...`), checked server-side on every command AND
	 * on the poll query itself (see `admin.remote.ts`'s module note). It is
	 * a gate against a stranger finding the URL, not against anyone who has it.
	 *
	 * `?fixtures=1` renders 20 fake rows with zero network calls — no poll,
	 * no token needed — so the screen can be built/reviewed without D1.
	 */
	import { page } from '$app/state';
	import { poll } from '$lib/poll.svelte';
	import { adminRoom, setBeat, lockRoom, openRoom, reopenTable, regenerateTable, resetTable, seedRoom, exportRoom } from './admin.remote';
	import { FIXTURE_ROOM } from '$lib/ui/admin/fixtures';
	import { ZONES } from '$lib/game/zones';
	import { FUTURES } from '$lib/game/futures';
	import type { AdminRoom, Beat } from '$lib/ui/admin/types';

	const BEATS: Beat[] = ['lobby', 'progress', 'reveal', 'finale', 'focus'];

	const fixturesMode = page.url.searchParams.get('fixtures') === '1';
	const token = page.url.searchParams.get('token') ?? '';

	let room = $state.raw<AdminRoom>(fixturesMode ? FIXTURE_ROOM : await adminRoom({ token }));
	let busy = $state(false);
	let banner = $state<string | null>(null);
	// Per-table inline confirm: which destructive verb (if any) is awaiting a second tap.
	let pending = $state<Record<number, 'reset' | 'regenerate' | undefined>>({});
	let focusInput = $state('');

	const { stale } = poll(3000, async () => {
		if (fixturesMode) return; // fixtures never touch the network — no poll, no staleness
		room = await adminRoom({ token });
	});

	function futureName(key: string | null): string {
		if (!key) return '—';
		return FUTURES.find((f) => f.key === key)?.name ?? key;
	}

	function ago(ts: number | null): string {
		if (ts == null) return '—';
		const s = Math.round((Date.now() - ts) / 1000);
		if (s < 60) return `${s}s ago`;
		if (s < 3600) return `${Math.round(s / 60)}m ago`;
		return `${Math.round(s / 3600)}h ago`;
	}

	async function refresh() {
		if (fixturesMode) return;
		room = await adminRoom({ token });
	}

	async function run(label: string, fn: () => Promise<{ ok: boolean; reason?: string }>) {
		if (fixturesMode) {
			banner = `fixtures mode — "${label}" is not wired to a server`;
			return;
		}
		busy = true;
		banner = null;
		try {
			const res = await fn();
			if (!res.ok) banner = res.reason ?? `${label} failed`;
			await refresh();
		} finally {
			busy = false;
		}
	}

	function toggleLock() {
		return run(room.closed ? 'open room' : 'close room', () => (room.closed ? openRoom({ token }) : lockRoom({ token })));
	}

	function chooseBeat(beat: Beat) {
		if (beat === 'focus') return; // focus needs a table number — see the Focus action per row
		return run('set beat', () => setBeat({ token, beat }));
	}

	function focusOnProjector(table: number) {
		return run('focus table', () => setBeat({ token, beat: 'focus', table }));
	}

	function goFocusInput() {
		const n = Number(focusInput);
		if (Number.isInteger(n) && n > 0) focusOnProjector(n);
	}

	function askConfirm(table: number, verb: 'reset' | 'regenerate') {
		pending = { ...pending, [table]: verb };
	}
	function cancelConfirm(table: number) {
		pending = { ...pending, [table]: undefined };
	}
	function confirmed(table: number, verb: 'reset' | 'regenerate') {
		pending = { ...pending, [table]: undefined };
		if (verb === 'reset') return run(`reset table ${table}`, () => resetTable({ token, table }));
		return run(`regenerate table ${table}`, () => regenerateTable({ token, table }));
	}

	async function doSeed() {
		await run('seed 20 tables', () => seedRoom({ token }));
	}

	async function doExport() {
		if (fixturesMode) {
			banner = 'fixtures mode — export is not wired to a server';
			return;
		}
		busy = true;
		try {
			const data = await exportRoom({ token });
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `room-export-${Date.now()}.json`;
			a.click();
			URL.revokeObjectURL(url);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Admin — Mission Control</title>
</svelte:head>

<div class="admin-root">
	{#if !fixturesMode && stale}
		<p class="stale-banner" role="alert">Connection is stale — showing the last good snapshot.</p>
	{/if}
	{#if banner}
		<p class="action-banner" role="status">{banner}</p>
	{/if}

	<header class="topbar">
		<h1>Mission Control</h1>

		<div class="topbar-group">
			<span class="lock-state" class:closed={room.closed}>Room is {room.closed ? 'closed' : 'open'}</span>
			<button disabled={busy} onclick={toggleLock}>{room.closed ? 'Open' : 'Close'} room</button>
		</div>

		<div class="topbar-group">
			<span class="label">Beat</span>
			{#each BEATS.filter((b) => b !== 'focus') as beat (beat)}
				<button disabled={busy} class:active={room.beat === beat} onclick={() => chooseBeat(beat)}>{beat}</button>
			{/each}
			<span class="label">Focus table</span>
			<input type="number" min="1" max="20" bind:value={focusInput} placeholder="#" />
			<button disabled={busy || !focusInput} onclick={goFocusInput}>Go</button>
			{#if room.beat === 'focus' && room.focusTable}
				<span class="label">(currently table {room.focusTable})</span>
			{/if}
		</div>

		<div class="topbar-group">
			{#if !room.seeded}
				<button disabled={busy} onclick={doSeed}>Seed 20 tables</button>
			{/if}
			<button disabled={busy} onclick={doExport}>Export</button>
		</div>
	</header>

	<table class="room-table">
		<thead>
			<tr>
				<th>#</th>
				<th>Future</th>
				<th>Step</th>
				<th>Images</th>
				<th>Last activity</th>
				<th>Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each room.tables as row (row.table)}
				<tr class:submitted={!!row.submittedAt} class:granted={row.granted}>
					<td class="tnum">{row.table}</td>
					<td>{futureName(row.futureKey)}</td>
					<td>{row.step}/{row.totalSteps}</td>
					<td>{row.imagesStored}/{ZONES.length}</td>
					<td>{ago(row.lastActivityAt)}</td>
					<td class="actions">
						<button disabled={busy} onclick={() => run(`reopen table ${row.table}`, () => reopenTable({ token, table: row.table }))}>
							Reopen
						</button>

						{#if pending[row.table] === 'regenerate'}
							<button disabled={busy} class="confirm" onclick={() => confirmed(row.table, 'regenerate')}>Confirm?</button>
							<button disabled={busy} onclick={() => cancelConfirm(row.table)}>Cancel</button>
						{:else}
							<button disabled={busy} onclick={() => askConfirm(row.table, 'regenerate')}>Regenerate</button>
						{/if}

						{#if pending[row.table] === 'reset'}
							<button disabled={busy} class="confirm danger" onclick={() => confirmed(row.table, 'reset')}>Confirm?</button>
							<button disabled={busy} onclick={() => cancelConfirm(row.table)}>Cancel</button>
						{:else}
							<button disabled={busy} class="danger-outline" onclick={() => askConfirm(row.table, 'reset')}>Reset</button>
						{/if}

						<button disabled={busy} onclick={() => focusOnProjector(row.table)}>Focus</button>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.admin-root {
		--ink: #1a1f2b;
		--ink-muted: #5a6472;
		--line: #d8dde3;
		--bg: #f7f8fa;
		--card: #ffffff;
		--accent: #2f6fed;
		--danger: #c0392b;
		--ok: #2f9e63;
		font-family: system-ui, sans-serif;
		color: var(--ink);
		background: var(--bg);
		min-height: 100vh;
		padding: 1.25rem;
	}

	h1 {
		font-size: 1.1rem;
		margin: 0;
		white-space: nowrap;
	}

	.stale-banner,
	.action-banner {
		margin: 0 0 0.75rem;
		padding: 0.5rem 0.9rem;
		border-radius: 6px;
		font-size: 0.85rem;
	}
	.stale-banner {
		background: #fbeaea;
		color: var(--danger);
	}
	.action-banner {
		background: #eef2fb;
		color: var(--ink);
	}

	.topbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1.25rem;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 0.75rem 1rem;
		margin-bottom: 1rem;
		position: sticky;
		top: 0.5rem;
		z-index: 5;
	}

	.topbar-group {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.label {
		font-size: 0.75rem;
		color: var(--ink-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.lock-state {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--ok);
	}
	.lock-state.closed {
		color: var(--danger);
	}

	button {
		font: inherit;
		font-size: 0.82rem;
		padding: 0.35rem 0.65rem;
		border-radius: 6px;
		border: 1px solid var(--line);
		background: var(--card);
		cursor: pointer;
		color: var(--ink);
	}
	button:hover:not(:disabled) {
		border-color: var(--accent);
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	button.active {
		background: var(--accent);
		color: white;
		border-color: var(--accent);
	}
	button.danger-outline {
		color: var(--danger);
		border-color: var(--danger);
	}
	button.confirm {
		background: var(--accent);
		color: white;
	}
	button.confirm.danger {
		background: var(--danger);
	}

	input[type='number'] {
		width: 3.5rem;
		padding: 0.3rem 0.4rem;
		border-radius: 6px;
		border: 1px solid var(--line);
	}

	.room-table {
		width: 100%;
		border-collapse: collapse;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 10px;
		overflow: hidden;
		font-size: 0.85rem;
	}
	.room-table th,
	.room-table td {
		text-align: left;
		padding: 0.5rem 0.6rem;
		border-bottom: 1px solid var(--line);
	}
	.room-table th {
		background: #eef1f5;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-muted);
	}
	.tnum {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
	tr.submitted .tnum::after {
		content: ' ✓';
		color: var(--ok);
	}
	tr.granted td:first-child {
		box-shadow: inset 3px 0 0 var(--accent);
	}
	.actions {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
</style>
