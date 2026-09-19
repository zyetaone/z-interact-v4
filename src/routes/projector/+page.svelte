<script lang="ts">
	import { page } from '$app/state';
	import { poll } from '$lib/poll.svelte';
	import { getProjectorRoom } from './gallery.remote';
	import { FIXTURE_ROOM } from './fixtures';
	import Lobby from '$lib/ui/projector/Lobby.svelte';
	import Progress from '$lib/ui/projector/Progress.svelte';
	import Reveal from '$lib/ui/projector/Reveal.svelte';
	import TableSequence from '$lib/ui/projector/TableSequence.svelte';
	import type { ProjectorRoom } from '$lib/ui/projector/types';

	let { data } = $props();

	/**
	 * Beats are an ordered array with a `/N` route and `?beat=N`
	 * (game-flow.md §4) — nothing in `room.ts`/`gate.ts` exposes a live
	 * "current beat" value yet, so the admin switches this projector by
	 * changing the URL's `?beat=` query param until that lands.
	 */
	const BEATS = ['lobby', 'progress', 'reveal'] as const;
	// Read once, not $derived — this gates which data source `room` is
	// initialised from below, a decision that only makes sense at mount.
	const fixturesMode = page.url.searchParams.get('fixtures') === '1';
	const beatIndex = $derived(Math.min(Math.max(Number(page.url.searchParams.get('beat') ?? '1') - 1, 0), BEATS.length - 1));
	const beat = $derived(BEATS[beatIndex]);
	const focusedTable = $derived.by(() => {
		const raw = page.url.searchParams.get('table');
		const n = raw ? Number(raw) : null;
		return n && Number.isInteger(n) && n > 0 ? n : null;
	});

	// Top-level `await` (svelte.config.js's `compilerOptions.experimental.async`),
	// same idiom the pre-existing stub used — first paint doesn't wait for the
	// first poll tick.
	let room = $state.raw<ProjectorRoom>(fixturesMode ? FIXTURE_ROOM : await getProjectorRoom());

	const { stale } = poll(3000, async () => {
		if (fixturesMode) return; // fixtures never touch the network — no poll, no staleness
		room = await getProjectorRoom();
	});

	const focusedView = $derived(focusedTable ? room.tables.find((t) => t.table === focusedTable) : null);
</script>

<svelte:head>
	<title>{data.eventTitle} — Projector</title>
</svelte:head>

{#if !fixturesMode && stale}
	<p class="stale-banner" role="alert">Connection is stale — showing the last good snapshot.</p>
{/if}

{#if focusedView}
	<TableSequence table={focusedView} />
{:else if beat === 'lobby'}
	<Lobby eventTitle={data.eventTitle} />
{:else if beat === 'progress'}
	<Progress tables={room.tables} />
{:else if beat === 'reveal'}
	<Reveal tables={room.tables} />
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
</style>
