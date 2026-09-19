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
	import '../../app.css';
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
	// Per-table inline confirm: which destructive verb (if any) is armed.
	// The trigger stays where it is and a separate Confirm control appears
	// BESIDE it, so a double-click on Regenerate/Reset cannot confirm itself
	// (design-review.md fix 6). An armed confirm disarms itself after
	// ARM_MS — the timer is the one legitimate $effect on this screen.
	let pending = $state<Record<number, 'reset' | 'regenerate' | undefined>>({});
	let focusInput = $state('');
	const ARM_MS = 5000;

	$effect(() => {
		const armed = Object.entries(pending).filter(([, verb]) => verb);
		if (armed.length === 0) return;
		const t = setTimeout(() => {
			pending = {};
		}, ARM_MS);
		return () => clearTimeout(t);
	});

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
			// Success is no longer silent: a working command and a dead one
			// used to look the same until the 3 s poll landed.
			banner = res.ok ? `${label} — done` : (res.reason ?? `${label} failed`);
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

	<header class="desk-bar">
		<h1>Mission Control</h1>

		<div class="desk-group">
			<span class="lock-state" class:closed={room.closed}>Room is {room.closed ? 'closed' : 'open'}</span>
			<button disabled={busy} onclick={toggleLock}>{room.closed ? 'Open' : 'Close'} room</button>
		</div>

		<div class="desk-group" role="group" aria-label="Beat">
			<span class="label">Beat</span>
			{#each BEATS.filter((b) => b !== 'focus') as beat (beat)}
				<button disabled={busy} class:active={room.beat === beat} aria-pressed={room.beat === beat} onclick={() => chooseBeat(beat)}>{beat}</button>
			{/each}
			<label class="label" for="focus-table">Focus table</label>
			<input id="focus-table" type="number" min="1" max="20" bind:value={focusInput} placeholder="#" />
			<button disabled={busy || !focusInput} onclick={goFocusInput}>Go</button>
			{#if room.beat === 'focus' && room.focusTable}
				<span class="label">(currently table {room.focusTable})</span>
			{/if}
		</div>

		<div class="desk-group">
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
						<button disabled={busy} onclick={() => focusOnProjector(row.table)}>Focus</button>

						<!-- The trigger stays put and goes armed; the confirm is a
						     SEPARATE control beside it, never under the cursor. -->
						<button
							disabled={busy}
							class="armable"
							class:armed={pending[row.table] === 'regenerate'}
							aria-pressed={pending[row.table] === 'regenerate'}
							onclick={() => (pending[row.table] === 'regenerate' ? cancelConfirm(row.table) : askConfirm(row.table, 'regenerate'))}
						>
							Regenerate
						</button>
						{#if pending[row.table] === 'regenerate'}
							<button disabled={busy} class="confirm" onclick={() => confirmed(row.table, 'regenerate')}>Confirm regenerate</button>
						{/if}

						<!-- Reset is the most destructive verb on the row: pushed to the
						     far end, its own shape, never the same size as Reopen. -->
						<span class="danger-slot">
							<button
								disabled={busy}
								class="danger-outline armable"
								class:armed={pending[row.table] === 'reset'}
								aria-pressed={pending[row.table] === 'reset'}
								onclick={() => (pending[row.table] === 'reset' ? cancelConfirm(row.table) : askConfirm(row.table, 'reset'))}
							>
								Reset
							</button>
							{#if pending[row.table] === 'reset'}
								<button disabled={busy} class="confirm danger" onclick={() => confirmed(row.table, 'reset')}>Confirm reset</button>
							{/if}
						</span>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	/* The desk wears the phone's tokens (app.css, imported above): navy
	   ground, gold accent, the same display/body faces. No white ground, no
	   system-ui (design-review.md desk scorecard). Only desk-specific
	   values are declared here. */
	.admin-root {
		--danger: #e0475c;
		--ok: var(--teal);
		--desk-tap: 44px;
		min-height: 100dvh;
		padding: 20px 24px 40px;
		color: var(--ink);
	}

	h1 {
		font-size: 22px;
		margin: 0;
		white-space: nowrap;
		color: var(--gold);
	}

	.stale-banner,
	.action-banner {
		margin: 0 0 12px;
		padding: 10px 14px;
		border-radius: 10px;
		font-size: 14px;
		border: 1px solid var(--line-strong);
	}
	.stale-banner {
		border-left: 3px solid var(--danger);
		background: rgba(224, 71, 92, 0.12);
	}
	.action-banner {
		border-left: 3px solid var(--teal);
		background: rgba(62, 201, 176, 0.1);
	}

	.desk-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 28px;
		background: var(--card-solid);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 12px 16px;
		margin-bottom: 16px;
		position: sticky;
		top: 8px;
		z-index: 5;
	}

	.desk-group {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.label {
		font-size: 12px;
		color: var(--ink-faint);
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}

	.lock-state {
		font-size: 14px;
		font-weight: 600;
		color: var(--ok);
	}
	.lock-state.closed {
		color: var(--danger);
	}

	/* Every desk control clears 44px — five per row, twenty rows, under
	   live pressure (desk scorecard: click targets). */
	.admin-root button {
		font: inherit;
		font-size: 14px;
		min-height: var(--desk-tap);
		padding: 0 14px;
		border-radius: 10px;
		border: 1px solid var(--line-strong);
		background: transparent;
		color: var(--ink);
		cursor: pointer;
	}
	.admin-root button:hover:not(:disabled) {
		border-color: var(--gold);
	}
	.admin-root button:focus-visible {
		outline: 3px solid var(--gold);
		outline-offset: 2px;
	}
	.admin-root button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.admin-root button.active {
		background: var(--gold);
		border-color: var(--gold);
		color: #10192a;
		font-weight: 700;
	}
	.admin-root button.danger-outline {
		color: var(--danger);
		border-color: var(--danger);
	}
	.admin-root button.armable.armed {
		border-style: dashed;
		color: var(--ink-dim);
	}
	.admin-root button.confirm {
		background: var(--gold);
		border-color: var(--gold);
		color: #10192a;
		font-weight: 700;
	}
	.admin-root button.confirm.danger {
		background: var(--danger);
		border-color: var(--danger);
		color: #fff;
	}

	input[type='number'] {
		width: 64px;
		min-height: var(--desk-tap);
		padding: 0 10px;
		border-radius: 10px;
		border: 1px solid var(--line-strong);
		background: rgba(10, 16, 32, 0.6);
		color: var(--ink);
		font: inherit;
		font-size: 15px;
	}
	input[type='number']:focus-visible {
		outline: 2px solid var(--teal);
		outline-offset: 1px;
	}

	.room-table {
		width: 100%;
		border-collapse: collapse;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
		font-size: 15px;
	}
	.room-table th,
	.room-table td {
		text-align: left;
		padding: 8px 12px;
		border-bottom: 1px solid var(--line);
		vertical-align: middle;
	}
	.room-table th {
		background: var(--card-solid);
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--ink-faint);
		font-weight: 500;
	}
	.tnum {
		font-family: var(--display);
		font-size: 18px;
		font-variant-numeric: tabular-nums;
		color: var(--gold);
	}
	tr.submitted .tnum::after {
		content: ' ✓';
		color: var(--ok);
		font-family: var(--body);
		font-size: 14px;
	}
	tr.granted td:first-child {
		box-shadow: inset 3px 0 0 var(--teal);
	}
	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-items: center;
	}
	.danger-slot {
		display: inline-flex;
		gap: 8px;
		margin-left: auto;
		padding-left: 16px;
		border-left: 1px solid var(--line);
	}
</style>
