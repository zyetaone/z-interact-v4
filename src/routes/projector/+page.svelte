<script lang="ts">
	/**
	 * THE WALL FOLLOWS THE DESK.
	 *
	 * The beat comes from `room_beat` (admin's `setBeat`) through
	 * `getProjectorRoom`, so pressing a button at the desk changes the
	 * screen on the next poll. `?beat=` and `?table=` are kept as a MANUAL
	 * OVERRIDE only — a rehearsal with no desk open, or an operator whose
	 * admin tab has died. When either is present it wins; when neither is,
	 * the room decides.
	 */
	import { page } from '$app/state';
	import { poll } from '$lib/poll.svelte';
	import { getProjectorRoom } from './gallery.remote';
	import { FIXTURE_ROOM } from './fixtures';
	import Lobby from '$lib/ui/projector/Lobby.svelte';
	import Progress from '$lib/ui/projector/Progress.svelte';
	import Reveal from '$lib/ui/projector/Reveal.svelte';
	import Finale from '$lib/ui/projector/Finale.svelte';
	import TableSequence from '$lib/ui/projector/TableSequence.svelte';
	import type { ProjectorBeat, ProjectorRoom } from '$lib/ui/projector/types';

	let { data } = $props();

	const BEATS: ProjectorBeat[] = ['lobby', 'progress', 'reveal', 'finale', 'focus'];

	// Read once, not $derived — this gates which data source `room` is
	// initialised from below, a decision that only makes sense at mount.
	const fixturesMode = page.url.searchParams.get('fixtures') === '1';

	// Top-level `await` (svelte.config.js's `compilerOptions.experimental.async`) —
	// first paint doesn't wait for the first poll tick.
	let room = $state.raw<ProjectorRoom>(fixturesMode ? FIXTURE_ROOM : await getProjectorRoom());

	const { stale } = poll(3000, async () => {
		if (fixturesMode) return; // fixtures never touch the network — no poll, no staleness
		room = await getProjectorRoom();
	});

	/**
	 * `?beat=` accepts the beat's NAME or its 1-based position. The position
	 * form is what game-flow.md §4 asked for ("an ordered array with a `/N`
	 * route and `?beat=N`"); the name form is what an operator types under
	 * pressure. Null means "no override — follow the room".
	 */
	const beatOverride = $derived.by<ProjectorBeat | null>(() => {
		const raw = page.url.searchParams.get('beat');
		if (!raw) return null;
		const byName = BEATS.find((b) => b === raw);
		if (byName) return byName;
		const n = Number(raw);
		if (Number.isInteger(n) && n >= 1 && n <= BEATS.length) return BEATS[n - 1];
		return null;
	});

	const tableOverride = $derived.by(() => {
		const raw = page.url.searchParams.get('table');
		const n = raw ? Number(raw) : null;
		return n && Number.isInteger(n) && n > 0 ? n : null;
	});

	// A `?table=` on its own means focus, since that is the only thing it can mean.
	const beat = $derived(beatOverride ?? (tableOverride ? 'focus' : room.beat));
	const focusedTable = $derived(tableOverride ?? room.focusTable);
	const focusedView = $derived(focusedTable ? room.tables.find((t) => t.table === focusedTable) : null);
	const overridden = $derived(beatOverride != null || tableOverride != null);
</script>

<svelte:head>
	<title>{data.eventTitle} — Projector</title>
</svelte:head>

{#if !fixturesMode && stale}
	<p class="stale-banner" role="alert">Connection is stale — showing the last good snapshot.</p>
{/if}

{#if overridden && !fixturesMode}
	<p class="override-badge">manual — ignoring the desk</p>
{/if}

{#if beat === 'focus' && focusedView}
	<TableSequence table={focusedView} />
{:else if beat === 'finale'}
	<Finale tables={room.tables} />
{:else if beat === 'progress'}
	<Progress tables={room.tables} />
{:else if beat === 'reveal'}
	<Reveal tables={room.tables} />
{:else}
	<Lobby eventTitle={data.eventTitle} />
{/if}

<style>
	.stale-banner {
		position: absolute;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		margin: 0;
		padding: 0.5rem 1.25rem;
		border-radius: 999px;
		background: rgba(224, 71, 92, 0.9);
		color: white;
		font-size: 0.85rem;
		letter-spacing: 0.03em;
	}

	/* Small and out of the way: the room should not read it, but the
	   operator must be able to see WHY the desk's button did nothing. */
	.override-badge {
		position: absolute;
		top: 0.6rem;
		right: 1rem;
		z-index: 10;
		margin: 0;
		font-size: 0.65rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-muted);
	}
</style>
