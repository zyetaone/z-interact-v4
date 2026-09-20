<script lang="ts">
	/**
	 * Screen 18 — in, and waiting. The copy says watch the screen, so the
	 * one gold primary is *See ours again*; editing stays open until the
	 * room locks but is demoted (design-review.md fix 10). The four zone
	 * frames the table just made fill the screen instead of empty ground.
	 */
	import { zoneLabel } from '$lib/game/zones';

	let {
		closed,
		gateReason,
		images = [],
		narrative = null,
		onedit,
		onimages
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
		onedit: () => void;
		onimages: () => void;
	} = $props();
</script>

<h1 class="stem">You're in. Watch the screen.</h1>
<p class="hint">{images.length === 1 ? 'Your workspace is with the rest of them now.' : 'Your four rooms are with the rest of them now.'}</p>

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
				<span class="zone">{zoneLabel(image.zoneKey)}</span>
			</li>
		{/each}
	</ul>
{/if}

<div class="grow"></div>

<div class="actions">
	<button class="btn ghost" disabled={closed} onclick={onedit}>
		{closed ? 'Answers are closed' : 'Edit answers'}
	</button>
	<button class="btn" onclick={onimages}>See ours again</button>
</div>

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
