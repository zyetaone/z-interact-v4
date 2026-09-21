<script lang="ts">
	/**
	 * THE FRONT PAGE — the instruction, then every table's code.
	 *
	 * Attendees are not supposed to arrive here: every table has a card with
	 * its own QR. But a mistyped URL, a shared screenshot or a curious phone
	 * lands here, and it used to greet them with the repo's name and a
	 * developer's test link.
	 *
	 * Generation 1 put a QR grid on its front page and this page now does the
	 * same, because the grid is what makes the page useful to the person
	 * standing at the front of the room: open it on the desk laptop or a
	 * spare screen and any table can scan its own code without anyone
	 * hunting for a reprint.
	 *
	 * TAPPING A TILE ENLARGES IT; IT DOES NOT NAVIGATE. That is deliberate,
	 * and it is generation 1's own behaviour (its grid opened a QR modal).
	 * `/t/[table]` has no cookie and no login — the URL IS the credential —
	 * so a phone that taps the wrong tile becomes that table and submits
	 * over its answers. A code you have to point a camera at is a choice
	 * made while looking at the number on the furniture, which is the only
	 * place the right answer is written. A facilitator can still hand out a
	 * link directly; see `/admin/cards` for the printable version.
	 *
	 * Nothing here is secret: `/t/1`..`/t/20` are guessable by construction
	 * and the range is public by design, so drawing them costs no privacy.
	 *
	 * ponytail: drawn client-side, like `/admin/cards` does, for the same
	 * reason — `qrcode` reaches for canvas and node APIs on some paths and
	 * none of that has to work in a Worker if the browser draws.
	 */
	// THE HOUSE STYLESHEET WAS NEVER IMPORTED HERE. Every other built screen
	// imports it; this page relied on `var(--ink, #f4ede0)` fallbacks, which
	// read as deliberate in the source and rendered cream text on a white
	// ground in the browser — the one page a lost attendee reaches, and it
	// was close to unreadable. `app.css` sets the navy ground the fallbacks
	// were always assuming.
	import '../app.css';
	import QRCode from 'qrcode';
	import { page } from '$app/state';
	import { TABLE_COUNT } from '$lib/game/questions';
	import { FUTURES } from '$lib/game/futures';
	import { LENS_IMAGE } from '$lib/game/visuals';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const title = $derived(data.eventTitle);

	const origin = $derived(page.url.origin);
	const tables = Array.from({ length: TABLE_COUNT }, (_, i) => i + 1);
	const urlFor = (t: number) => `${origin}/t/${t}`;

	let codes = $state.raw<Record<number, string>>({});
	/** The table whose code is enlarged, or null. */
	let zoomed = $state<number | null>(null);

	$effect(() => {
		let cancelled = false;
		(async () => {
			const out: Record<number, string> = {};
			for (const t of tables) {
				// High correction and a generous quiet zone, as on the printed
				// cards: this gets photographed at an angle off a screen.
				out[t] = await QRCode.toDataURL(urlFor(t), {
					errorCorrectionLevel: 'H',
					margin: 3,
					width: 600,
					color: { dark: '#0b1020ff', light: '#ffffffff' }
				});
			}
			if (!cancelled) codes = out;
		})();
		return () => {
			cancelled = true;
		};
	});
</script>

<svelte:head><title>{title}</title></svelte:head>

<main>
	<p class="eyebrow">{title}</p>
	<h1>Find the card on your table</h1>
	<p class="lede">
		Scan its QR code to begin. Each table has its own card, and one phone answers for the whole
		table.
	</p>
	<p class="help">No card? Scan your table's code below — the number on it must match the number on your table.</p>

	<ul class="grid">
		{#each tables as t (t)}
			<li>
				<button
					type="button"
					class="tile"
					aria-label={`Enlarge the QR code for table ${t}`}
					onclick={() => (zoomed = t)}
				>
					<span class="num">{t}</span>
					{#if codes[t]}
						<img src={codes[t]} alt={`QR code for table ${t}`} />
					{:else}
						<span class="placeholder" aria-hidden="true"></span>
					{/if}
				</button>
			</li>
		{/each}
	</ul>

	<!-- WHAT THE ROOM IS CHOOSING BETWEEN. The same six cards a table taps on
	     its own phone at Q1, with the picture and the one-line blurb it sees
	     there — no new information, so nothing is given away by showing them
	     here. It is the `blurb` and NOT `moodLine`: `moodLine` is the
	     pre-recipe mood paragraph, the one that reads "Night ... no daylight
	     anywhere" and was what made the lens art dim in the first place. It
	     is not shown to anyone.

	     WHICH table chose which lens stays hidden, as it is on the wall —
	     this is the menu, never the room's answers. -->
	<section class="lenses">
		<h2>Six futures, one per table</h2>
		<p class="sub">Each table chooses the world its workspace stands in.</p>
		<ul class="lens-grid">
			{#each FUTURES as f (f.key)}
				<li class="lens">
					{#if LENS_IMAGE[f.key]}
						<img src={LENS_IMAGE[f.key]} alt="" loading="lazy" />
					{/if}
					<h3>{f.name}</h3>
					<p>{f.blurb}</p>
				</li>
			{/each}
		</ul>
	</section>
</main>

{#if zoomed !== null}
	<!-- The modal is the scannable one: a tile in a 20-up grid is too small
	     to read off a screen at arm's length. -->
	<div
		class="overlay"
		role="dialog"
		aria-modal="true"
		aria-label={`QR code for table ${zoomed}`}
		tabindex="-1"
		onclick={() => (zoomed = null)}
		onkeydown={(e) => e.key === 'Escape' && (zoomed = null)}
	>
		<div class="zoom">
			<p class="eyebrow">TABLE</p>
			<p class="big">{zoomed}</p>
			{#if codes[zoomed]}
				<img src={codes[zoomed]} alt={`QR code for table ${zoomed}`} />
			{/if}
			<p class="url">{urlFor(zoomed).replace(/^https?:\/\//, '')}</p>
			<p class="dismiss">Tap anywhere to close</p>
		</div>
	</div>
{/if}

<style>
	main {
		min-height: 100svh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 16px;
		padding: 32px 24px 48px;
		max-width: 60rem;
		margin-inline: auto;
		text-align: center;
	}
	.eyebrow {
		margin: 0;
		font-size: 13px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--muted, #8b8f9c);
	}
	h1 {
		margin: 0;
		font-size: clamp(1.75rem, 6vw, 2.5rem);
		line-height: 1.15;
		text-wrap: balance;
		color: var(--ink, #f4ede0);
	}
	.lede {
		margin: 0;
		font-size: 1.05rem;
		line-height: 1.5;
		color: var(--ink, #f4ede0);
		max-width: 34rem;
		margin-inline: auto;
	}
	.help {
		margin: 8px 0 0;
		font-size: 0.9rem;
		color: var(--muted, #8b8f9c);
	}

	.grid {
		list-style: none;
		margin: 20px 0 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
		gap: 12px;
	}
	.tile {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 10px 8px;
		border-radius: 12px;
		border: 1px solid var(--line, rgba(244, 237, 224, 0.14));
		background: var(--card-solid, #141a2c);
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.tile:hover,
	.tile:focus-visible {
		border-color: var(--gold, #c9a05a);
	}
	.num {
		font-size: 13px;
		letter-spacing: 0.08em;
		color: var(--muted, #8b8f9c);
	}
	.tile img,
	.placeholder {
		width: 100%;
		aspect-ratio: 1;
		border-radius: 6px;
		background: #fff;
	}
	.placeholder {
		background: rgba(244, 237, 224, 0.08);
	}

	.lenses {
		margin-top: 40px;
		padding-top: 28px;
		border-top: 1px solid var(--line, rgba(244, 237, 224, 0.14));
	}
	h2 {
		margin: 0;
		font-family: var(--display, Georgia, serif);
		font-size: 1.35rem;
		color: var(--gold, #c9a05a);
	}
	.sub {
		margin: 6px 0 0;
		font-size: 0.9rem;
		color: var(--muted, #8b8f9c);
	}
	.lens-grid {
		list-style: none;
		margin: 18px 0 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: 14px;
		text-align: left;
	}
	.lens {
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid var(--line, rgba(244, 237, 224, 0.14));
		background: var(--card-solid, #141a2c);
	}
	.lens img {
		width: 100%;
		aspect-ratio: 4 / 3;
		object-fit: cover;
		display: block;
	}
	.lens h3 {
		margin: 12px 14px 0;
		font-size: 0.98rem;
		color: var(--ink, #f4ede0);
	}
	.lens p {
		margin: 6px 14px 14px;
		font-size: 0.85rem;
		line-height: 1.45;
		color: var(--muted, #8b8f9c);
	}

	.overlay {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 24px;
		background: rgba(10, 16, 32, 0.92);
		z-index: 10;
	}
	.zoom {
		text-align: center;
		max-width: min(90vw, 460px);
		/* A panel, not bare text: without it the number and the URL float
		   over the headline behind them and both become hard to read. */
		padding: 20px 20px 16px;
		border-radius: var(--radius, 14px);
		border: 1px solid var(--line, rgba(244, 237, 224, 0.14));
		background: var(--ground-deep, #0a1020);
	}
	.big {
		margin: 2px 0 12px;
		font-size: clamp(2.5rem, 12vw, 4rem);
		line-height: 1;
		color: var(--gold, #c9a05a);
	}
	.zoom img {
		width: 100%;
		border-radius: 10px;
		background: #fff;
	}
	.url {
		margin: 12px 0 0;
		font-size: 0.85rem;
		color: var(--muted, #8b8f9c);
		word-break: break-all;
	}
	.dismiss {
		margin: 6px 0 0;
		font-size: 0.8rem;
		color: var(--muted, #8b8f9c);
	}
</style>
