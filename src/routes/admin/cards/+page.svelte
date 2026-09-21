<script lang="ts">
	/**
	 * REPRINT A TABLE CARD, FROM THE DESK.
	 *
	 * The app tells people to scan a card in three places and, until this
	 * page, had no way to make one. Generation 1 of this app did: it drew a
	 * QR per table in the browser and had a print view, so a facilitator
	 * could replace a lost card in seconds. That was lost in the rewrite and
	 * the `qrcode` dependency was left installed and unused.
	 *
	 * The printed set for the event is produced outside the repo (see
	 * NEW-EVENT.md). This page is the recovery path for the night: a card
	 * goes missing, gets a drink spilled on it, or a table is added, and
	 * someone needs one sheet now.
	 *
	 * The codes come from `$lib/ui/qr`, shared with the front page's grid —
	 * see that module for why they are drawn in the browser and what the
	 * scanning options are for.
	 *
	 * The token rides on the URL exactly as it does for the desk. Nothing
	 * here reads the database — the codes are a pure function of the origin
	 * and the table number — so this page is not an information leak. It is
	 * behind the same URL only so it is found the same way.
	 */
	import '../../../app.css';
	import { page } from '$app/state';
	import { drawTableCodes } from '$lib/ui/qr';
	import { TABLE_COUNT } from '$lib/game/questions';

	const origin = $derived(page.url.origin);
	const tables = Array.from({ length: TABLE_COUNT }, (_, i) => i + 1);
	const urlFor = (t: number) => `${origin}/t/${t}`;

	let codes = $state.raw<Record<number, string>>({});

	$effect(() => {
		let cancelled = false;
		drawTableCodes(tables, urlFor, 900).then((out) => {
			if (!cancelled) codes = out;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<svelte:head><title>Table cards</title></svelte:head>

<div class="bar">
	<p>
		One sheet per table. Print this page, or print one card and cut. The codes come from this
		page's own address, so a card printed from a preview URL points at the preview.
	</p>
	<button class="btn" onclick={() => window.print()}>Print</button>
</div>

<main>
	{#each tables as t (t)}
		<section class="card">
			<p class="eyebrow">TABLE</p>
			<p class="num">{t}</p>
			{#if codes[t]}
				<img src={codes[t]} alt={`QR code for table ${t}`} />
			{:else}
				<div class="placeholder" aria-hidden="true"></div>
			{/if}
			<p class="scan">Scan to begin</p>
			<p class="url">{urlFor(t).replace(/^https?:\/\//, '')}</p>
			<p class="note">One phone per table · everyone answers together</p>
		</section>
	{/each}
</main>

<style>
	.bar {
		display: flex;
		gap: 16px;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		background: var(--card-solid, #141a2c);
		color: var(--ink, #f4ede0);
	}
	.bar p {
		margin: 0;
		font-size: 13px;
		max-width: 58ch;
	}
	.btn {
		min-height: 44px;
		padding: 0 20px;
		border-radius: 10px;
		border: 1px solid var(--line-strong, rgba(244, 237, 224, 0.38));
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	main {
		background: #ffffff;
	}
	.card {
		box-sizing: border-box;
		width: 100%;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: 24px;
		color: #0b1020;
		background: #ffffff;
		break-after: page;
		text-align: center;
	}
	.eyebrow {
		margin: 0;
		font-size: 15px;
		letter-spacing: 0.22em;
		color: #787e8c;
	}
	.num {
		margin: 0;
		font-size: clamp(4rem, 22vw, 9rem);
		line-height: 1;
		font-weight: 700;
	}
	img,
	.placeholder {
		width: min(62vw, 340px);
		height: min(62vw, 340px);
		margin: 18px 0 6px;
	}
	.placeholder {
		background: #f1f2f5;
	}
	.scan {
		margin: 0;
		font-size: clamp(1.2rem, 4vw, 1.7rem);
		font-weight: 600;
	}
	.url {
		margin: 4px 0 0;
		font-size: 0.95rem;
		color: #787e8c;
	}
	.note {
		margin: 10px 0 0;
		font-size: 0.85rem;
		color: #787e8c;
	}
	@media print {
		.bar {
			display: none;
		}
		.card {
			min-height: auto;
			height: 100vh;
		}
	}
</style>
