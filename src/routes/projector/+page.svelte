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
	import { FIXTURE_ROOM, FIXTURE_ROOM_FOUR } from './fixtures';
	import Lobby from '$lib/ui/projector/Lobby.svelte';
	import Progress from '$lib/ui/projector/Progress.svelte';
	import Reveal from '$lib/ui/projector/Reveal.svelte';
	import Finale from '$lib/ui/projector/Finale.svelte';
	import TableSequence from '$lib/ui/projector/TableSequence.svelte';
	import Ledger from '$lib/ui/projector/Ledger.svelte';
	import { isWideWall, panelCount, parseAspect } from '$lib/ui/projector/aspect';
	import type { ProjectorBeat, ProjectorRoom } from '$lib/ui/projector/types';

	let { data } = $props();

	const BEATS: ProjectorBeat[] = ['lobby', 'progress', 'reveal', 'finale', 'focus'];

	// Read once, not $derived — this gates which data source `room` is
	// initialised from below, a decision that only makes sense at mount.
	// `?fixtures=1` is the ZONE_SET default (one workspace image per table);
	// `?fixtures=four` is the four-zone geometry, for a room that set it.
	const fixturesParam = page.url.searchParams.get('fixtures');
	const fixturesMode = fixturesParam === '1' || fixturesParam === 'four';

	// Top-level `await` (svelte.config.js's `compilerOptions.experimental.async`) —
	// first paint doesn't wait for the first poll tick.
	let room = $state.raw<ProjectorRoom>(fixturesMode ? (fixturesParam === 'four' ? FIXTURE_ROOM_FOUR : FIXTURE_ROOM) : await getProjectorRoom());

	const { stale } = poll(3000, async () => {
		if (fixturesMode) return; // fixtures never touch the network — no poll, no staleness
		// `.refresh()` IS THE POLL. A remote query caches by (function, args),
		// so `await getProjectorRoom()` on the second tick returns the first
		// tick's value from memory and issues no request at all. Measured
		// against production before this line existed: the beat was changed
		// on the server, and sixteen seconds and five ticks later the wall
		// still read "lobby" having made zero network calls, while a reload
		// showed the new beat instantly. The staleness banner cannot catch it
		// either — the cached call resolves successfully every time, so the
		// wall reports healthy while frozen. The phone route already had this
		// and said why; the wall did not.
		const q = getProjectorRoom();
		await q.refresh();
		room = (await q) as ProjectorRoom;
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

	/**
	 * THE FRAME DECIDES THE LAYOUT. Bound rather than measured in an
	 * `$effect`: the browser already tracks these two numbers, and a resize
	 * (a scaler waking up, an operator moving the window between the wall
	 * and a TV) has to re-lay the beat without a reload.
	 */
	let frameWidth = $state(0);
	let frameHeight = $state(0);
	const ratio = $derived(frameHeight > 0 ? frameWidth / frameHeight : 0);
	const aspectOverride = $derived(parseAspect(page.url.searchParams.get('aspect')));
	const wide = $derived(isWideWall(aspectOverride, ratio));
	// A forced `wide` on a 16:9 frame still gets the venue's three panels,
	// so the preview shows the composition the wall will show.
	const panels = $derived(wide ? Math.max(3, panelCount(ratio)) : 1);

	/**
	 * `?surface=ledger` turns this screen into the room ledger rather than a
	 * copy of the wall — what the two ceiling-mounted televisions show. See
	 * `Ledger.svelte`. Opt-in, because a bare 16:9 frame is just as likely
	 * to be a rehearsal laptop, which should show the wall.
	 */
	const ledgerSurface = $derived(page.url.searchParams.get('surface') === 'ledger');

	/** `?diag=1` — operator words on screen, for a rehearsal with no desk. */
	const diagnostics = $derived(page.url.searchParams.get('diag') === '1');
</script>

<svelte:window bind:innerWidth={frameWidth} bind:innerHeight={frameHeight} />

<svelte:head>
	<title>{data.eventTitle} — Projector</title>
</svelte:head>

<!-- STALENESS, WITHOUT OPERATOR COPY ON THE AUDIENCE WALL.
     This was a red pill of 13.6px text in front of the room: too small for
     the room to read and on the wrong screen for the operator (design
     review §2). The wall now says it with a hairline along the top edge —
     a fact the operator can see from the desk and the room reads as
     nothing at all. `?diag=1` restores the words for a rehearsal. -->
{#if !fixturesMode && stale}
	<div class="stale-edge" role="alert" aria-label="Connection is stale"></div>
	{#if diagnostics}
		<p class="stale-banner">Connection is stale — showing the last good snapshot.</p>
	{/if}
{/if}

{#if overridden && !fixturesMode}
	<p class="override-badge">manual — ignoring the desk</p>
{/if}

{#if ledgerSurface}
	<Ledger {beat} tables={room.tables} focusTable={focusedTable} />
{:else if beat === 'focus' && focusedView}
	<TableSequence table={focusedView} {panels} />
{:else if beat === 'finale'}
	<Finale tables={room.tables} {panels} />
{:else if beat === 'progress'}
	<Progress tables={room.tables} {wide} />
{:else if beat === 'reveal'}
	<Reveal tables={room.tables} {panels} />
{:else}
	<Lobby eventTitle={data.eventTitle} tables={room.tables} {wide} />
{/if}

<style>
	.stale-edge {
		position: absolute;
		inset: 0 0 auto 0;
		height: 0.6vh;
		z-index: 10;
		background: #e0475c;
	}
	.stale-banner {
		position: absolute;
		top: 1.5vh;
		left: 50%;
		transform: translateX(-50%);
		z-index: 10;
		margin: 0;
		padding: 0.5rem 1.25rem;
		border-radius: 999px;
		background: rgba(224, 71, 92, 0.9);
		color: white;
		font-size: var(--type-caption);
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
