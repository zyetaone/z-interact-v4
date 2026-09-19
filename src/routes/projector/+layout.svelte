<script lang="ts">
	let { children } = $props();
</script>

<svelte:head>
	<title>Projector</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="projector-root">
	{@render children()}
</div>

<style>
	/* Navy-Gold Ledger, presenter/"lifted" variant — design-direction.md
	   Direction 1. This repo has no global token layer yet, so tokens are
	   declared here, scoped to the projector route only. */
	.projector-root {
		--ground: #16233a;
		--card: #1f2f4a;
		--card-alpha: rgba(31, 47, 74, 0.4);
		--ink: #ffffff;
		--ink-muted: rgba(255, 255, 255, 0.6);
		--gold: #e0bd7c;
		--teal: #4fe0c4;
		--line: rgba(255, 255, 255, 0.28);

		position: fixed;
		inset: 0;
		background: var(--ground);
		color: var(--ink);
		font-family: 'DM Sans', system-ui, sans-serif;
		overflow: hidden;
	}
</style>
