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
	import { eraVerdict, nudge, type Era } from '$lib/game/era';

	let {
		futureKey,
		era,
		onpick,
		onera,
		onskip,
		onnext
	}: {
		futureKey: string | null;
		era: Era | null;
		onpick: (key: string) => void;
		onera: (era: Era) => void;
		onskip: () => void;
		onnext: () => void;
	} = $props();


	/** Her PUSH line for Q1, verbatim — spoken at the table, never typed. */
	const PUSH = 'what do you see through the window?';

	const ERA_LABEL: Record<Era, string> = {
		'retro-1930s': '1930s reborn',
		'same-as-2026': 'Same as 2026',
		'recognisably-2035': '2035',
		'hyperfuturistic-2040': '2040'
	};

	const chosen = $derived(FUTURES.find((f) => f.key === futureKey) ?? null);
	const current = $derived(era ?? chosen?.eraDefault ?? null);

	function step(dir: 'earlier' | 'later'): { era: Era; verdict: 'ok' | 'warn' | 'blocked' } | null {
		if (!chosen || !current) return null;
		const next = nudge(current, dir);
		if (next === current) return null;
		return { era: next, verdict: eraVerdict(chosen, next) };
	}

	const earlier = $derived(step('earlier'));
	const later = $derived(step('later'));
	const warnNow = $derived(chosen && current ? eraVerdict(chosen, current) === 'warn' : false);
</script>

<h1 class="stem" id="lens-stem">{LENS_STEM}</h1>
<p class="hint">It sets the building, the skyline and the light.</p>
<p class="talk"><span class="push-label">Talk</span><span>{PUSH}</span></p>

<ul class="futures" role="radiogroup" aria-labelledby="lens-stem">
	{#each FUTURES as future (future.key)}
		{@const picked = future.key === futureKey}
		<li>
			<button
				type="button"
				role="radio"
				class="lens"
				aria-checked={picked}
				onclick={() => onpick(future.key)}
			>
				<img class="lens-img" src={LENS_IMAGE[future.key]} alt={future.name} loading="lazy" />
				<span class="lens-shade"></span>
				<span class="lens-check" aria-hidden="true">&#10003;</span>
				<span class="lens-body">
					<span class="name">{future.name}</span>
					<span class="blurb">{future.blurb}</span>
				</span>
			</button>
		</li>
	{/each}
</ul>

{#if chosen && current}
	<section class="chip-row" aria-label="Era">
		<span class="field-label">Era</span>
		<div class="chips">
			<button
				type="button"
				class="chip nudge"
				aria-label="Earlier"
				disabled={!earlier || earlier.verdict === 'blocked'}
				onclick={() => earlier && onera(earlier.era)}>&larr;</button
			>
			<span class="chip now">{ERA_LABEL[current]}</span>
			<button
				type="button"
				class="chip nudge"
				aria-label="Later"
				disabled={!later || later.verdict === 'blocked'}
				onclick={() => later && onera(later.era)}>&rarr;</button
			>
		</div>

		{#if chosen.eraLocked}
			<p class="reason">
				{chosen.name} is fixed to {ERA_LABEL[chosen.eraDefault]} — any other era contradicts the card itself.
			</p>
		{:else if (earlier && earlier.verdict === 'blocked') || (later && later.verdict === 'blocked')}
			<p class="reason">{chosen.name} reaches one step either side of {ERA_LABEL[chosen.eraDefault]}, no further.</p>
		{/if}
		{#if warnNow}
			<p class="reason warn">Allowed, but it makes a duller picture than {chosen.name} usually gives you.</p>
		{/if}
	</section>

{/if}

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

	.futures {
		display: flex;
		flex-direction: column;
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
		aspect-ratio: 3 / 2;
		padding: 0;
		overflow: hidden;
		border: 2px solid var(--line);
		border-radius: var(--radius);
		background: var(--card-solid);
		color: var(--ink);
		text-align: left;
		cursor: pointer;
		transition: border-color 0.12s ease;
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
		padding: 12px 14px 12px;
	}

	.name {
		font-family: var(--display);
		font-size: 20px;
		line-height: 1.15;
		text-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
	}

	.blurb {
		font-size: 13px;
		line-height: 1.35;
		color: var(--ink-dim);
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

	.chip-row {
		border-top: 1px solid var(--line);
		padding-top: 18px;
		margin-bottom: 18px;
	}

	.chips {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.chip {
		min-height: 48px;
		border-radius: 999px;
		border: 1px solid var(--line-strong);
		background: transparent;
		padding: 0 18px;
		font-size: 15px;
		cursor: pointer;
	}

	.chip.now {
		border-color: var(--gold);
		color: var(--gold);
		flex: 1;
		text-align: center;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.chip.nudge {
		flex: 0 0 52px;
		font-size: 18px;
	}

	.chip.nudge[disabled] {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.reason {
		font-size: 13px;
		line-height: 1.4;
		color: var(--ink-faint);
		margin: 10px 0 0;
	}

	.reason.warn {
		color: var(--warn);
	}

</style>
