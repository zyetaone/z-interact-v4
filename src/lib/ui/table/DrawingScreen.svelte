<script lang="ts">
	/**
	 * Screen 16 — the table's own prompt, a frame per zone, and a poll.
	 *
	 * The poll lives in THIS component rather than the page so the interval
	 * exists only while the screen does. Three missed reads raise the stale
	 * banner (`poll.svelte.ts`'s rule, ported from presence): the last good
	 * snapshot stays on screen, because a stale line is indistinguishable
	 * from a true one unless the screen says so.
	 *
	 * The zones are SKELETON FRAMES, not a list of words. v1 had the frame
	 * and v4 shipped a text list: for the two minutes this screen is up, a
	 * static row and a dead app look the same on a phone, and the table has
	 * nothing else to read the room by. The frame also reserves the picture's
	 * aspect ratio, so the gallery does not jump when the render lands.
	 */
	import { poll } from '$lib/poll.svelte';
	import { isHeroZone, zoneLabel } from '$lib/game/zones';
	import { generationLine } from './generation-line';

	let {
		prompt,
		images,
		brand = '',
		refresh
	}: {
		prompt: string;
		images: { zoneKey: string; state: string; url: string | null; error: string | null }[];
		/**
		 * `BRAND_LINE`, or empty. A PROP rather than a reach into page state,
		 * so this component stays as pure as the rest of `lib/ui/table`.
		 */
		brand?: string;
		refresh: () => Promise<unknown>;
	} = $props();

	const beat = poll(2000, () => refresh());

	/**
	 * The brand line split into "everything but the last glyph" and the last
	 * glyph, which is the bit that breathes. Deliberately positional rather
	 * than matching a letter: no company name may appear in this repo, so the
	 * markup cannot know which character it is animating — only that it is
	 * the last one. A one-character brand animates whole; an empty one
	 * renders nothing at all.
	 */
	const mark = $derived.by(() => {
		const line = brand.trim();
		if (!line) return null;
		return { head: line.slice(0, -1), tick: line.slice(-1) };
	});
</script>

<h1 class="stem">Being drawn.</h1>
<p class="hint">A couple of minutes. Put the phone down.</p>

{#if beat.stale}
	<p class="banner">
		No answer from the room for {beat.staleSeconds}s — this is the last thing we heard, not
		necessarily the latest.
	</p>
{/if}

<ul class="zones">
	{#each images as image (image.zoneKey)}
		<li class:hero={isHeroZone(image.zoneKey)}>
			<!-- A failed frame stops shimmering: movement reads as progress, and
			     there is none. -->
			<div class="frame" class:skeleton={image.state !== 'failed'} class:failed={image.state === 'failed'}>
				<span class="state">{generationLine(image.state)}</span>
			</div>
			{#if images.length > 1}
				<span class="zone">{zoneLabel(image.zoneKey)}</span>
			{/if}
		</li>
	{/each}
</ul>

<div class="grow"></div>

<!-- The waiting screen is where v1 put it, and it is the right place: the
     one moment a table is looking at the phone with nothing to do. Absent
     entirely when `BRAND_LINE` is unset. -->
{#if mark}
	<p class="brand">{mark.head}<span class="brand-tick">{mark.tick}</span></p>
{/if}

<style>
	.brand {
		text-align: center;
		font-size: 12px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-faint);
		margin: 0 0 6px;
	}

	.zones {
		list-style: none;
		margin: 0 0 24px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.zones li {
		position: relative;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
	}

	/* Same two ratios the gallery uses, so the skeleton is the exact shape of
	   the picture that replaces it — see ImagesScreen's `.frame`. */
	.frame {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		aspect-ratio: 3 / 2;
	}

	/* See ImagesScreen's `.pending:not(.skeleton)` — a bare `background`
	   shorthand here outranks the global `.skeleton` and wipes its gradient. */
	.frame:not(.skeleton) {
		background: var(--card-solid);
	}

	.zones li.hero .frame {
		aspect-ratio: 16 / 9;
	}

	.state {
		font-size: 12px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--teal);
	}

	.frame.failed .state {
		color: var(--warn);
	}

	.zone {
		position: absolute;
		left: 12px;
		bottom: 10px;
		font-family: var(--display);
		font-size: 17px;
		text-transform: capitalize;
		text-shadow: 0 1px 8px rgba(0, 0, 0, 0.8);
	}
</style>
