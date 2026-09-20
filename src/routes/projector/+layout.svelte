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

		/* TYPE AT 20 METRES.
		   Every surface in this room is 1080 rows tall — the LED wall
		   (5760x1080) and the two wall TVs (1920x1080) — so type sized in
		   `vh` lands on the same pixel height on all of them, and scales
		   with any other frame it is given. The floor is the caption:
		   4.5vh is 48.6px at 1080, which is the smallest thing the back of
		   the room can read. Nothing on the wall may be smaller. */
		--type-caption: 4.5vh;
		--type-body: 5.5vh;
		--type-heading: 7vh;
		/* The table number is the loudest element: it is the only thing a
		   delegate needs to find their own table's picture from 20 m. */
		--type-table-no: 11vh;
		/* The twenty-tile grid is not a hero tile: at 11vh a cell's number
		   plus its two-line state caption is taller than a quarter of the
		   frame, the row cannot shrink below its content, and the grid
		   pushes past the bottom of the screen. Still 75px at 1080, well
		   over the 48px floor. */
		--type-table-no-grid: 7vh;

		position: fixed;
		inset: 0;
		background: var(--ground);
		color: var(--ink);
		font-family: 'DM Sans', system-ui, sans-serif;
		overflow: hidden;
	}
</style>
