<script lang="ts">
	/**
	 * THE FRONT PAGE IS THE ROOM, NOT A LEAFLET.
	 *
	 * Generation 1's front page was its gallery: twenty square tiles, one
	 * per table, each showing that table's picture once it existed and its
	 * QR code until then. No headline, no explanation — the grid IS the
	 * instruction, and it fills in through the session so the screen at the
	 * front of the room is worth looking at from the first scan to the last
	 * render. This page now does the same.
	 *
	 * What it replaces: a headline, a lede, a help line and a second section
	 * of six lens cards with their blurbs — four blocks of prose above a
	 * grid that says all of it by being a grid. The lens cards in particular
	 * were the menu a table is about to be shown on its own phone, printed
	 * on the wall before they choose.
	 *
	 * IT READS THE PROJECTOR'S OWN QUERY. `getProjectorRoom` is already a
	 * public, unauthenticated, batched read of every table's state and
	 * stored image (the wall runs on it), so this page needs no endpoint of
	 * its own, no new auth surface and no second copy of the "which image is
	 * current" rule. It ignores `beat` — the desk drives the wall, not this.
	 *
	 * TAPPING A TILE ENLARGES IT; IT DOES NOT NAVIGATE. That is deliberate,
	 * and it is generation 1's own behaviour. `/t/[table]` has no cookie and
	 * no login — the URL IS the credential — so a phone that taps the wrong
	 * tile would become that table and submit over its answers. A code you
	 * have to point a camera at is a choice made while looking at the number
	 * on the furniture, which is the only place the right answer is written.
	 *
	 * Nothing here is secret: `/t/1`..`/t/20` are guessable by construction
	 * and the range is public by design, so drawing them costs no privacy.
	 *
	 * The codes come from `$lib/ui/qr`, shared with `/admin/cards` — the two
	 * pages had drifted to different quiet zones for codes scanned in the
	 * same room. That module's note carries the reasoning.
	 */
	// THE HOUSE STYLESHEET WAS NEVER IMPORTED HERE. Every other built screen
	// imports it; this page relied on `var(--ink, #f4ede0)` fallbacks, which
	// read as deliberate in the source and rendered cream text on a white
	// ground in the browser.
	import '../app.css';
	import { drawTableCodes } from '$lib/ui/qr';
	import { page } from '$app/state';
	import { poll } from '$lib/poll.svelte';
	import { TABLE_COUNT } from '$lib/game/questions';
	import { getProjectorRoom } from './projector/gallery.remote';
	import type { ProjectorRoom, TableView } from '$lib/ui/projector/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const title = $derived(data.eventTitle);

	const origin = $derived(page.url.origin);
	const tables = Array.from({ length: TABLE_COUNT }, (_, i) => i + 1);
	const urlFor = (t: number) => `${origin}/t/${t}`;

	// Top-level `await` (svelte.config.js's `compilerOptions.experimental.async`),
	// as the projector does — first paint does not wait for the first tick.
	let room = $state.raw<ProjectorRoom>(await getProjectorRoom());

	poll(5000, async () => {
		// `.refresh()` IS THE POLL. A remote query caches by (function,
		// args), so a bare `await getProjectorRoom()` on the second tick
		// returns the first tick's value from memory and issues no request
		// at all — a frozen screen that reports itself healthy. The
		// projector's own note records the sixteen seconds this cost on the
		// wall before the line existed.
		const q = getProjectorRoom();
		await q.refresh();
		room = (await q) as ProjectorRoom;
	});

	const byTable = $derived(new Map(room.tables.map((t) => [t.table, t])));

	/** The one picture to show for a table: its first stored zone, or null. */
	function shotOf(view: TableView | undefined): string | null {
		if (!view) return null;
		const done = view.images.find((i) => (i.state === 'stored' || i.state === 'done') && i.url);
		return done?.url ?? null;
	}

	/**
	 * True while a render is actually in flight for this table.
	 *
	 * Without this a table whose picture is being drawn looks EXACTLY like a
	 * table that has not scanned yet — both show a QR code — so the one
	 * screen at the front of the room cannot tell "twelve tables are working"
	 * from "twelve tables never started". The step count only covers the
	 * questionnaire; it goes quiet at the moment the room gets interesting.
	 *
	 * `queued`/`requested` are the two live states of the generation machine
	 * (`generate.ts`); `stored`/`done`/`failed` are terminal, and a failed
	 * table must not shimmer — movement reads as progress.
	 */
	function drawingOf(view: TableView | undefined): boolean {
		if (!view) return false;
		return view.images.some((i) => i.state === 'queued' || i.state === 'requested');
	}

	const drawn = $derived(tables.filter((t) => shotOf(byTable.get(t))).length);

	let codes = $state.raw<Record<number, string>>({});
	/** The table whose tile is enlarged, or null. */
	let zoomed = $state<number | null>(null);

	$effect(() => {
		let cancelled = false;
		drawTableCodes(tables, urlFor, 600).then((out) => {
			if (!cancelled) codes = out;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<svelte:head><title>{title}</title></svelte:head>

<main>
	<!-- The only text on the page: whose room this is, and how much of it
	     has been drawn. v1 carried a progress bar in the same position for
	     the same reason — it is the one number an operator glances up for. -->
	<header>
		<p class="eyebrow">{title}</p>
		<p class="tally">{drawn} of {TABLE_COUNT} drawn</p>
	</header>
	<div class="bar" role="presentation"><span style="width: {(drawn / TABLE_COUNT) * 100}%"></span></div>

	<ul class="grid">
		{#each tables as t (t)}
			{@const view = byTable.get(t)}
			{@const shot = shotOf(view)}
			{@const drawing = !shot && drawingOf(view)}
			<li>
				<button
					type="button"
					class="tile"
					class:drawing
					aria-label={shot ? `Enlarge table ${t}'s workspace` : `Enlarge the QR code for table ${t}`}
					onclick={() => (zoomed = t)}
				>
					{#if shot}
						<img class="shot" src={shot} alt={`Table ${t}'s workspace`} />
					{:else if codes[t]}
						<img class="qr" src={codes[t]} alt={`QR code for table ${t}`} />
					{:else}
						<span class="placeholder" aria-hidden="true"></span>
					{/if}
					<span class="num">{t}</span>
					<!-- A table mid-flow gets a step count over its code, so the
					     grid shows the room moving before any picture exists. -->
					{#if drawing}
						<!-- Sits over the code, because the code is no longer the point
						     for this table — nobody else should be scanning it. -->
						<span class="sheen skeleton" aria-hidden="true"></span>
						<span class="step">drawing</span>
					{:else if !shot && view && view.step !== null && view.step > 0}
						<span class="step">{view.step} of {view.totalSteps}</span>
					{/if}
				</button>
			</li>
		{/each}
	</ul>

	<!-- Absent entirely when `BRAND_LINE` is unset, which is the default. -->
	{#if data.brand}
		<p class="brand">{data.brand}</p>
	{/if}
</main>

{#if zoomed !== null}
	{@const shot = shotOf(byTable.get(zoomed))}
	<!-- The modal is the scannable one: a tile in a 20-up grid is too small
	     to read off a screen at arm's length. -->
	<div
		class="overlay"
		role="dialog"
		aria-modal="true"
		aria-label={shot ? `Table ${zoomed}'s workspace` : `QR code for table ${zoomed}`}
		tabindex="-1"
		onclick={() => (zoomed = null)}
		onkeydown={(e) => e.key === 'Escape' && (zoomed = null)}
	>
		<div class="zoom" class:wide={!!shot}>
			<p class="eyebrow">TABLE {zoomed}{shot ? "'S VISION OF THE FUTURE" : ''}</p>
			{#if shot}
				<img class="big-shot" src={shot} alt={`Table ${zoomed}'s workspace`} />
				<!-- The table's own paragraph, under its own picture. A person
				     standing in the room can read what a table chose without
				     being at that table — and it names no lens, because the
				     lens is hidden analysis everywhere else on the wall. -->
				{#if byTable.get(zoomed)?.narrative}
					<p class="vision">{byTable.get(zoomed)?.narrative}</p>
				{/if}
			{:else if codes[zoomed]}
				<img class="big-qr" src={codes[zoomed]} alt={`QR code for table ${zoomed}`} />
				<p class="url">{urlFor(zoomed).replace(/^https?:\/\//, '')}</p>
			{/if}
			<p class="dismiss">Tap anywhere to close</p>
		</div>
	</div>
{/if}

<style>
	.brand {
		text-align: center;
		font-size: 12px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-faint);
		margin: 2px 0 0;
	}

	.vision {
		margin: 14px auto 0;
		max-width: 62ch;
		font-size: 17px;
		line-height: 1.5;
		text-align: left;
		color: var(--ink-soft, inherit);
	}

	main {
		min-height: 100svh;
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 20px 16px 28px;
		max-width: 100rem;
		margin-inline: auto;
	}

	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	.eyebrow {
		margin: 0;
		font-size: 13px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.tally {
		margin: 0;
		font-size: 13px;
		letter-spacing: 0.08em;
		color: var(--gold);
	}

	.bar {
		height: 2px;
		border-radius: 2px;
		background: var(--line);
		overflow: hidden;
	}

	.bar span {
		display: block;
		height: 100%;
		background: var(--gold);
		transition: width 0.4s ease;
	}

	/* Two across on a phone, five on the desk laptop — v1's own breakpoints,
	   and five columns is what puts twenty tables on one screen.

	   THE WIDTH IS CAPPED BY THE HEIGHT, which is the only way square tiles
	   fit a viewport without scrolling: at five across, twenty tiles are
	   four rows, so each tile may be at most a quarter of the space left
	   under the header, and the grid may be at most five of those wide. A
	   plain `max-width: 88rem` overflowed the bottom row on a laptop, which
	   is the row a front-of-room screen most needs to show. */
	.grid {
		list-style: none;
		margin: 6px auto 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
		width: 100%;
		/* `margin: auto` does not centre a stretched flex item that is held
		   narrower by `max-width` — it stays at flex-start. This does. */
		align-self: center;
	}

	@media (min-width: 640px) {
		.grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}

	@media (min-width: 1024px) {
		.grid {
			grid-template-columns: repeat(5, minmax(0, 1fr));
			/* header + rule + paddings ≈ 92px; 4 rows, 3 gaps of 10px. */
			max-width: calc((100svh - 92px - 30px) / 4 * 5 + 40px);
		}
	}

	.tile {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		display: block;
		padding: 0;
		overflow: hidden;
		border-radius: var(--radius);
		border: 1px solid var(--line);
		background: var(--card-solid);
		color: inherit;
		font: inherit;
		cursor: pointer;
		transition:
			border-color 0.12s ease,
			transform 0.12s ease;
	}

	.tile:hover,
	.tile:focus-visible {
		border-color: var(--gold);
		transform: scale(1.02);
	}

	.shot,
	.qr,
	.placeholder {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}

	.shot {
		object-fit: cover;
	}

	/* The code is the thing being photographed, so it keeps its quiet zone
	   and its white ground rather than being cropped to fill. */
	.qr {
		object-fit: contain;
		background: #fff;
		padding: 6%;
	}

	.placeholder {
		background: rgba(244, 237, 224, 0.06);
	}

	/* Legible over a white QR and over a photograph, without knowing which. */
	.num,
	.step {
		position: absolute;
		top: 6px;
		border-radius: 6px;
		background: rgba(10, 16, 32, 0.82);
		color: var(--ink);
		font-size: 12px;
		letter-spacing: 0.06em;
		line-height: 1;
		padding: 5px 7px;
	}

	.num {
		left: 6px;
	}

	.step {
		right: 6px;
		color: var(--gold);
	}

	.overlay {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 24px;
		background: rgba(10, 16, 32, 0.94);
		z-index: 10;
	}

	.zoom {
		text-align: center;
		max-width: min(90vw, 460px);
		padding: 16px 16px 12px;
		border-radius: var(--radius);
		border: 1px solid var(--line);
		background: var(--ground-deep);
	}

	/* An explicit WIDTH, not just a max: the panel is shrink-to-fit, so a
	   `width: 100%` image inside it resolves against the image's own
	   intrinsic size and a small render opened as a small modal. */
	.zoom.wide {
		width: min(94vw, 1100px);
		max-width: min(94vw, 1100px);
	}

	.big-qr {
		width: 100%;
		border-radius: 10px;
		background: #fff;
	}

	.big-shot {
		width: 100%;
		max-height: 76svh;
		object-fit: contain;
		border-radius: 10px;
		display: block;
	}

	.url {
		margin: 12px 0 0;
		font-size: 0.85rem;
		color: var(--muted);
		word-break: break-all;
	}

	.dismiss {
		margin: 8px 0 0;
		font-size: 0.8rem;
		color: var(--muted);
	}

	/* The code stays visible underneath — this is a table at work, not a
	   tile that failed — but it is clearly no longer the thing to scan. */
	.tile.drawing .qr {
		opacity: 0.25;
	}

	.sheen {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		opacity: 0.6;
		mix-blend-mode: screen;
		pointer-events: none;
	}
</style>
