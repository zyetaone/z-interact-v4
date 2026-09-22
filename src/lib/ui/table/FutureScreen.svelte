<script lang="ts">
	/**
	 * VERSION 4's Q1, "Choose your lens" (BRIEF.md, the question owner's
	 * 19 Sep 17:58 send): six plain-named futures, her PUSH line ("what do
	 * you see through the window?") spoken at the table, and the era as a
	 * chip default only — "Era (2035/2040) is now a PUSH cue, not a
	 * question". The chip keeps the future's default and the one-step nudge
	 * from game-flow.md §0; V3's 2026 "what are you protecting?" field is
	 * gone with the question it belonged to.
	 *
	 * A blocked nudge is greyed **with its reason shown**, never silently
	 * refused — the reason comes from `era.ts`'s rules, not from prose
	 * written here.
	 *
	 * The six lenses are image cards (design-review.md §3): one column of
	 * 3:2 bands, name and one-line blurb over the shared `--scrim`, and a
	 * selection state that is not colour-only — unselected cards sit at 75%
	 * brightness, the chosen one at 100% with a gold border and a check.
	 * The cards are a `radiogroup`: exactly one future, announced as such.
	 */
	import { FUTURES, LENS_STEM } from '$lib/game/futures';
	import { LENS_IMAGE } from '$lib/game/visuals';

	let {
		futureKey,
		onpick,
		onskip,
		onnext
	}: {
		futureKey: string | null;
		onpick: (key: string) => void;
		onskip: () => void;
		onnext: () => void;
	} = $props();


	const chosen = $derived(FUTURES.find((f) => f.key === futureKey) ?? null);
</script>

<!-- THE QUESTION, THEN THE CITIES. 21 Sep 22:27, a screenshot of this screen
     with the hint and the Talk line circled in red: "All this can be
     removed". The six pictures say what a lens is better than a line
     explaining that a lens sets the building and the light does. -->
<h1 class="stem" id="lens-stem">{LENS_STEM}</h1>

<ul class="futures" role="radiogroup" aria-labelledby="lens-stem">
	{#each FUTURES as future (future.key)}
		{@const picked = future.key === futureKey}
		<li>
			<button
				type="button"
				role="radio"
				class="lens skeleton"
				aria-checked={picked}
				onclick={() => onpick(future.key)}
			>
				<!-- EAGER, not lazy. These four are the first thing the table looks
				     at and every one of them is above the fold, so `loading="lazy"`
				     was deferring exactly the images the screen is made of — on a
				     venue's wifi with twenty phones asking at once. Measured
				     22 Sep: ~1.2 MB across the four, and a capture taken two
				     seconds in showed three empty cards.
				     The skeleton on the card behind them is what the table looks
				     at meanwhile; an opaque `object-fit: cover` image covers it
				     the moment it paints, so no JS tracks the load. -->
				<img
					class="lens-img"
					src={LENS_IMAGE[future.key]}
					alt={future.name}
					loading="eager"
					fetchpriority="high"
				/>
				<span class="lens-shade"></span>
				<span class="lens-check" aria-hidden="true">&#10003;</span>
				<!-- NAME OVER PICTURE. "The cityscapes need to be simplified"
				     (21 Sep 22:27). Each card carried two or three lines of
				     blurb over the image, so six cards ran past 2,000px on a
				     390-wide phone and the way forward sat below all of it.
				     The blurb is still in `futures.ts` and still prints in the
				     question book — it is the SCREEN that stops explaining. -->
				<span class="lens-body">
					<span class="name">{future.name}</span>
				</span>
			</button>
		</li>
	{/each}
</ul>

<div class="grow"></div>

<!-- THE WAY FORWARD HAS TO ARRIVE WITH THE CHOICE.
     Six full-bleed 3:2 cards make this screen ~2,000 px on a 390x844 phone,
     so `Next` — which only exists once a lens is chosen — sat about 1,200 px
     below the fold. Tapping a card showed a check and, as far as the table
     could see, nothing else. This is the first interaction of the night.

     Sticky, not `scrollIntoView`: the scroll was tried and LOST A RACE. It
     fired (scrollY 0 -> 962) and then the era chip rendered, the page grew
     by ~110 px, and the button ended up 883 px down a 844 px viewport
     again. Sticky has no race to lose. Scoped to this screen — `.actions`
     is shared by every screen in `app.css` and the others are short enough
     to reach. -->
<div class="actions">
	{#if chosen}
		<button class="btn" onclick={onnext}>Next</button>
	{:else}
		<button class="btn ghost" onclick={onskip}>No future fits us — skip</button>
	{/if}
</div>

<style>
	.actions {
		position: sticky;
		bottom: 0;
		/* Opaque, not the scrim: a card scrolling under a translucent bar put
		   a photograph behind the one control that must never be ambiguous. */
		background: var(--ground-deep);
		padding-bottom: max(12px, env(safe-area-inset-bottom));
		margin-inline: calc(var(--gutter) * -1);
		padding-inline: var(--gutter);
		z-index: 2;
	}

	/* TWO ACROSS, SO THE WHOLE CHOICE IS ONE SCREEN. Six full-bleed 3:2
	   bands stacked in a column ran past 1,500px on a 390-wide phone, and
	   the way forward sat under all of it — the same shape that needed a
	   sticky button to be reachable at all. Six 4:3 tiles two across fit in
	   a viewport, and a table compares cities by looking rather than by
	   scrolling. Holds its shape if the set drops from six to four. */
	.futures {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		margin: 0 0 22px;
		padding: 0;
		list-style: none;
	}

	/* A 3:2 band, full width: ~358x239 on a 390pt phone, so three cards
	   fit a screen (design-review.md §3). Never square — the skyline is
	   the point of the choice. The card is the whole control. */
	.lens {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 4 / 3;
		padding: 0;
		overflow: hidden;
		border: 2px solid var(--line);
		border-radius: var(--radius);
		color: var(--ink);
		text-align: left;
		cursor: pointer;
		transition: border-color 0.12s ease;
	}

	/* `:not(.skeleton)` for the reason ImagesScreen's `.pending` carries it:
	   a bare `background` shorthand resets `background-image`/`-size` and
	   Svelte's scoping class outranks the global rule. Here the class is
	   always on, so this is the never-taken branch that keeps the card navy
	   if the skeleton is ever removed. */
	.lens:not(.skeleton) {
		background: var(--card-solid);
	}

	.lens-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		/* Third selection channel: brightness, which reads in daylight
		   where a border alone does not. */
		filter: brightness(0.75);
		transition: filter 0.12s ease;
	}

	.lens-shade {
		position: absolute;
		inset: 0;
		background: var(--scrim);
	}

	.lens-body {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 9px 10px 9px;
	}

	.name {
		font-family: var(--display);
		font-size: 16px;
		line-height: 1.15;
		text-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
	}


	.lens-check {
		position: absolute;
		top: 10px;
		right: 10px;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--gold);
		color: #10192a;
		font-size: 16px;
		font-weight: 700;
		line-height: 28px;
		text-align: center;
		opacity: 0;
		transform: scale(0.6);
		transition:
			opacity 0.12s ease,
			transform 0.12s ease;
	}

	.lens[aria-checked='true'] {
		border-color: var(--gold);
	}

	.lens[aria-checked='true'] .lens-img {
		filter: brightness(1);
	}

	.lens[aria-checked='true'] .lens-check {
		opacity: 1;
		transform: scale(1);
	}

</style>
