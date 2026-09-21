<script lang="ts">
	/**
	 * Attendees are not supposed to arrive here — every table has a card with
	 * its own QR code. But a mistyped URL, a shared screenshot or a curious
	 * phone lands on this page, and it used to greet them with the repo's
	 * name as an h1 and a developer's test link. Anyone who reached it saw
	 * the scaffolding rather than the event.
	 *
	 * It is deliberately a dead end: it explains where they should be and
	 * offers no way to pick a table, because a phone choosing its own table
	 * number is how one table submits over another's answers.
	 */
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const title = $derived(data.eventTitle);
</script>

<svelte:head><title>{title}</title></svelte:head>

<main>
	<p class="eyebrow">{title}</p>
	<h1>Find the card on your table</h1>
	<p class="lede">
		Scan its QR code to begin. Each table has its own card, and one phone answers for the whole
		table.
	</p>
	<p class="help">If the card will not scan, ask a facilitator for your table's link.</p>
</main>

<style>
	main {
		min-height: 100svh;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 16px;
		padding: 32px 24px;
		max-width: 34rem;
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
	}
	.help {
		margin: 8px 0 0;
		font-size: 0.9rem;
		color: var(--muted, #8b8f9c);
	}
</style>
