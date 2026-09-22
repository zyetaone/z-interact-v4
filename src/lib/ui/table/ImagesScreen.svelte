<script lang="ts">
	/**
	 * Screen 17 — the table's images as they arrive, the prompt beneath,
	 * and *Draw again*. Zero images is not a blank screen: the prompt is
	 * shown with the line game-flow.md §1 specifies.
	 *
	 * Under `ZONE_SET=hero` (the default) there is ONE image, rendered 16:9
	 * because that is the aspect it was drawn at, with the table's narrative
	 * under it — the paragraph that says how the picture follows from what
	 * they chose. Under `four`/`all` the same markup stacks the tiles as it
	 * always did; nothing here enumerates zones itself, it renders whatever
	 * the server sent.
	 */
	import { poll } from '$lib/poll.svelte';
	import { isHeroZone, zoneLabel } from '$lib/game/zones';

	let {
		prompt,
		images,
		narrative = null,
		regenerating,
		canUndo = false,
		onundo,
		failed,
		refresh,
		onregenerate,
		onretry,
		ondone
	}: {
		prompt: string;
		images: { zoneKey: string; state: string; url: string | null; error: string | null }[];
		/** How this picture follows from the table's selections. Null until it has been written; it arrives on a later poll. */
		narrative?: string | null;
		regenerating: boolean;
		/** Why the last *Draw again* was refused — the throttle's own words, not a generic line. */
		failed: string;
		refresh: () => Promise<unknown>;
		/**
		 * *Draw again*, optionally with the table's steer — "change one thing",
		 * typed while looking at this render. Empty string means no steer, and
		 * clears any previous one rather than quietly re-applying it.
		 */
		onregenerate: (steer: string) => void;
		/** True when an earlier render exists to go back to. */
		canUndo?: boolean;
		/** Restores the previous picture. Spends nothing — it is already drawn and already paid for. */
		onundo: () => void;
		/** One zone, one render — the failed tile's own control, not *Draw again*. */
		onretry: (zone: string) => void;
		ondone: () => void;
	} = $props();

	const beat = poll(2000, () => refresh());
	const arrived = $derived(images.filter((i) => i.url));
	const failedZones = $derived(images.filter((i) => i.state === 'failed'));
	/** The provider's own words for the first failure, trimmed — a table that knows WHY can tell the desk. */
	const failureReason = $derived(failedZones.find((i) => i.error)?.error?.slice(0, 160) ?? '');
	/** Nothing landed AND nothing is still coming — the one case where *Draw again* is the only way forward. */
	const allFailed = $derived(arrived.length === 0 && failedZones.length > 0);

	/**
	 * v1 had an edit-and-regenerate modal with add / remove / change boxes.
	 * This is one box, because in v4 the prompt is COMPOSED from the answers
	 * — the review screen's prompt is read-only for exactly this reason, and
	 * a free edit of it is accepted and discarded on the default zone set.
	 * A steer composes like the wildcard instead, so it reaches the picture
	 * through the same path as everything else.
	 *
	 * ponytail: not round-tripped through the server. It is a sentence about
	 * the picture on screen; a reload means a new look at it. Persist it if
	 * tables start losing work to accidental refreshes.
	 */
	let steer = $state('');
</script>

<h1 class="stem">Your workspace of the future.</h1>

{#if failed}
	<p class="banner">{failed}</p>
{/if}

{#if beat.stale}
	<p class="banner">No answer from the room for {beat.staleSeconds}s — this may not be the latest.</p>
{/if}

{#if allFailed}
	<p class="banner">The drawing failed — draw again.</p>
	{#if failureReason}<p class="reason">{failureReason}</p>{/if}
{:else if images.length === 0}
	<p class="banner">The drawing didn't land — the desk can redraw this table.</p>
{/if}

{#if images.length > 0}
	<ul class="gallery">
		{#each images as image (image.zoneKey)}
			<li class:hero={isHeroZone(image.zoneKey)}>
				<!-- Every tile sits in the same 3:2 navy frame whether its image has
				     arrived, is still decoding, or never came — a tile mid-load reads
				     as a placeholder, never as a hole in the gallery. -->
				<div class="frame">
					{#if image.url}
						<img src={image.url} alt="Our {zoneLabel(image.zoneKey).toLowerCase()}" loading="lazy" />
					{:else}
						<div class="pending" class:failed={image.state === 'failed'}>
							{#if image.state === 'failed'}
								<span>this one failed</span>
								<button class="btn ghost retry" disabled={regenerating} onclick={() => onretry(image.zoneKey)}>
									Try this one again
								</button>
							{:else}
								still drawing
							{/if}
						</div>
					{/if}
				</div>
				<!-- The zone label earns its place only when there is more than one
				     zone to tell apart. In a hero room there is exactly one picture
				     and the heading above it already says "Your workspace of the
				     future" — the caption was the same words again, printed on the
				     picture. -->
				{#if images.length > 1}
					<span class="zone">{zoneLabel(image.zoneKey)}</span>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

{#if narrative}
	<p class="narrative">{narrative}</p>
{/if}


<div class="grow"></div>

{#if arrived.length}
	<section class="steer-field">
		<label class="field-label" for="steer">
			Change one thing<span class="optional">optional</span>
		</label>
		<textarea
			id="steer"
			class="field"
			rows="2"
			maxlength="140"
			placeholder="More light. Fewer people. Make the stair the centre."
			bind:value={steer}
		></textarea>
	</section>
{/if}

<div class="grow"></div>

<div class="actions">
	{#if canUndo}
		<!-- Costs nothing: the picture it goes back to is already drawn and
		     already paid for, so this skips the cooldown and the cap. -->
		<button class="btn ghost" disabled={regenerating} onclick={onundo}>Undo</button>
	{/if}
	<button class="btn ghost" disabled={regenerating} onclick={() => onregenerate(steer)}>
		{regenerating ? 'Redrawing…' : steer.trim() ? 'Draw again with this' : 'Draw again'}
	</button>
	<button class="btn" onclick={ondone}>We're done</button>
</div>

<style>
	.steer-field {
		margin-bottom: 18px;
	}

	/* Same token as the questions' optional field, so "you do not have to
	   fill this in" looks identical everywhere it is true. */
	.optional {
		margin-left: 8px;
		padding: 1px 6px;
		border: 1px solid var(--line, currentColor);
		border-radius: 999px;
		font-size: 11px;
		letter-spacing: 0.08em;
		opacity: 0.75;
		white-space: nowrap;
	}

	.gallery {
		list-style: none;
		margin: 0 0 22px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.gallery li {
		position: relative;
		border-radius: var(--radius);
		overflow: hidden;
		border: 1px solid var(--line);
	}

	.frame {
		position: relative;
		width: 100%;
		aspect-ratio: 3 / 2;
		background: var(--card-solid);
	}

	/* The hero is drawn 16:9 (fal.ts's DEFAULT_ASPECT_RATIO). A 3:2 frame
	   would crop the ends off the one picture the table gets. */
	.gallery li.hero .frame {
		aspect-ratio: 16 / 9;
	}

	.narrative {
		margin: 0 0 20px;
		padding-left: 12px;
		border-left: 2px solid var(--gold);
		font-family: var(--display);
		font-size: 17px;
		line-height: 1.5;
	}

	/* The same caption scrim the lens cards use — white serif straight
	   onto a real render vanishes (design-review.md §3). */
	.frame::after {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--scrim);
		pointer-events: none;
	}

	.gallery img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.pending {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		background: var(--card);
		color: var(--ink-faint);
		font-size: 13px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.pending.failed {
		flex-direction: column;
		gap: 12px;
		color: var(--warn);
	}

	/* Sits above the scrim so it can be tapped; the frame's ::after is inert. */
	.retry {
		position: relative;
		z-index: 1;
		min-height: 44px;
		padding: 0 18px;
		font-size: 14px;
		letter-spacing: 0;
		text-transform: none;
	}

	/* Quiet: the table needs the sentence above, and the desk needs this one. */
	.reason {
		margin: -10px 0 18px;
		font-size: 12px;
		line-height: 1.5;
		color: var(--ink-faint);
	}

	.zone {
		position: absolute;
		left: 12px;
		bottom: 10px;
		font-family: var(--display);
		font-size: 17px;
		text-shadow: 0 1px 8px rgba(0, 0, 0, 0.8);
	}

</style>
