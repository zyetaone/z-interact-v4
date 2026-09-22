<script lang="ts">
	/**
	 * Screen 18 — in, and waiting. THE LAST SCREEN, with nothing to press.
	 *
	 * It used to carry *Edit answers* and *See ours again*. Both are gone,
	 * which is v1's shape: its ThankYouScreen showed the picture and the
	 * message and offered no way back into the questions at all. Checked end
	 * to end before removing them — v1 needs no "see it again" button
	 * because the picture is already on this screen, and it needs no "edit"
	 * because a table that has said it is done has said it is done.
	 *
	 * A table that finishes by accident is not stuck: the desk can Reopen or
	 * Reset it. That belongs to the facilitator, not to a button on a phone
	 * the whole table is crowded around.
	 */
	import { zoneLabel } from '$lib/game/zones';

	let {
		closed,
		gateReason,
		images = [],
		narrative = null
	}: {
		closed: boolean;
		gateReason: string;
		images?: { zoneKey: string; state: string; url: string | null }[];
		/**
		 * The table's own answers written back as a short paragraph
		 * (`routes/t/[table]/narrative.ts`). Null until it has been written —
		 * it arrives on a later poll, and its absence is not an error state,
		 * so nothing is shown in its place.
		 */
		narrative?: string | null;
	} = $props();
</script>

<h1 class="stem">You're in. Watch the screen.</h1>

{#if narrative}
	<p class="narrative">{narrative}</p>
{/if}

{#if closed}
	<p class="banner calm">{gateReason || 'Answers are closed — the screen has moved on.'}</p>
{/if}

{#if images.length > 0}
	<ul class="thumbs" class:single={images.length === 1} aria-label={images.length === 1 ? 'Your workspace' : 'Your four rooms'}>
		{#each images as image (image.zoneKey)}
			<li>
				<div class="frame">
					{#if image.url}
						<img src={image.url} alt="Our {zoneLabel(image.zoneKey).toLowerCase()}" loading="lazy" />
					{:else}
						<span class="pending">{image.state === 'failed' ? 'failed' : 'drawing'}</span>
					{/if}
				</div>
				<!-- Same rule as the images screen: the label earns its place only
				     when there is more than one zone to tell apart. -->
				{#if images.length > 1}
					<span class="zone">{zoneLabel(image.zoneKey)}</span>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<!-- No `.grow` spacer: its only job was pushing the action row to the bottom
     of the viewport, and there is no action row any more. -->

<style>
	/* The read-back sits between the hint and the four frames, quieter than
	   the heading and warmer than the hint. */
	.narrative {
		margin: 0 0 20px;
		padding-left: 12px;
		border-left: 2px solid var(--gold);
		font-family: var(--display);
		font-size: 17px;
		line-height: 1.5;
	}

	.thumbs {
		list-style: none;
		margin: 0 0 22px;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	/* One image is the table's answer, not a thumbnail of it — full width, and
	   16:9 because that is the aspect it was drawn at. */
	.thumbs.single {
		grid-template-columns: 1fr;
	}

	.thumbs.single .frame {
		aspect-ratio: 16 / 9;
	}

	.frame {
		position: relative;
		width: 100%;
		aspect-ratio: 3 / 2;
		overflow: hidden;
		border-radius: var(--radius);
		border: 1px solid var(--line);
		background: var(--card-solid);
	}

	.frame img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.pending {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	.zone {
		display: block;
		margin-top: 6px;
		font-family: var(--display);
		font-size: 15px;
	}
</style>
