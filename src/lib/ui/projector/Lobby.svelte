<script lang="ts">
	let { eventTitle }: { eventTitle: string } = $props();
</script>

<!-- Lobby beat (game-flow.md §4, tag C): title, thesis, no QR — tent cards carry the QR.
     The seven futures are a lens each table picks on its own phone, not a headline the
     room reads here — kept off the lobby by design. -->
<section class="lobby">
	<div class="rule"></div>
	<h1>{eventTitle}</h1>
	<p class="thesis">Each table draws the workspace of 2035 through its own lens.</p>
	<p class="cue">Scan the card on your table to begin.</p>
</section>

<style>
	.lobby {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
		text-align: center;
		padding: 4rem;
	}
	.rule {
		width: 6rem;
		height: 3px;
		background: var(--gold);
	}
	h1 {
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 4.5rem;
		font-weight: 600;
		margin: 0;
		letter-spacing: 0.01em;
	}
	.thesis {
		font-size: 1.5rem;
		color: var(--ink-muted);
		margin: 0;
		max-width: 40ch;
	}
	.cue {
		margin-top: 2.5rem;
		font-size: 1.25rem;
		color: var(--gold);
		letter-spacing: 0.04em;
	}
</style>
