<script lang="ts">
	/**
	 * One question's options. Honours all three `SelectKind`s from
	 * `game/questions.ts`: `one` replaces, `many` toggles (capped at its
	 * optional `max`, e.g. Q4/Q7/Q9's "up to 3" facets), `pick n` toggles
	 * and drops the oldest selection once n are held — so the table never
	 * hits a dead end where nothing responds to a tap.
	 *
	 * An `open` option carries a text field that appears only once it is
	 * selected; its typed reply is what `layers.ts` splices into that
	 * option's `{text}` slot.
	 */
	import type { Question, WildcardQuestion } from '$lib/game/questions';
	import { OPTION_IMAGE, hasOptionImage } from '$lib/game/visuals';

	let {
		question,
		keys,
		texts = {},
		onchange
	}: {
		question: Question | WildcardQuestion;
		keys: string[];
		texts?: Record<string, string>;
		onchange: (keys: string[], texts: Record<string, string>) => void;
	} = $props();

	const select = $derived('select' in question ? question.select : { kind: 'one' as const });
	const limit = $derived(
		select.kind === 'pick' ? select.n : select.kind === 'many' && select.max ? select.max : Infinity
	);

	function toggle(key: string) {
		let next: string[];
		if (select.kind === 'one') {
			next = keys.includes(key) ? [] : [key];
		} else if (keys.includes(key)) {
			next = keys.filter((k) => k !== key);
		} else {
			next = [...keys, key].slice(-limit);
		}
		onchange(next, texts);
	}

	function setText(key: string, value: string) {
		onchange(keys, { ...texts, [key]: value });
	}

	function imageOf(key: string): string | undefined {
		return hasOptionImage(question.id, key) ? OPTION_IMAGE[`${question.id}:${key}`] : undefined;
	}

	/** A short, fully-illustrated question reads as a 2-column card grid;
	 *  anything longer, or with an open (typed) option, stays a row list with
	 *  a thumbnail on the rows that have one. Selection logic is the same
	 *  either way — only the rendering branches. */
	const cards = $derived(question.options.length <= 4 && question.options.every((o) => hasOptionImage(question.id, o.key)));
</script>

<ul class="options" class:cards>
	{#each question.options as option (option.key)}
		{@const picked = keys.includes(option.key)}
		{@const img = imageOf(option.key)}
		<li>
			{#if img && cards}
				<button type="button" class="card" aria-pressed={picked} onclick={() => toggle(option.key)}>
					<img class="card-img" src={img} alt={option.label} loading="lazy" />
					<span class="card-shade"></span>
					<span class="card-check" aria-hidden="true">&#10003;</span>
					<span class="card-label">{option.label}</span>
				</button>
			{:else}
				<button type="button" class="opt" class:tile={!!img} aria-pressed={picked} onclick={() => toggle(option.key)}>
					{#if img}
						<img class="thumb" src={img} alt={option.label} loading="lazy" />
					{:else}
						<span class="mark"></span>
					{/if}
					<span class="label">{option.label}</span>
				</button>
			{/if}
			{#if option.open && picked}
				<div class="open-field">
					<textarea
						class="field"
						rows="2"
						placeholder="In your own words"
						value={texts[option.key] ?? ''}
						oninput={(e) => setText(option.key, e.currentTarget.value)}
					></textarea>
				</div>
			{/if}
		</li>
	{/each}
</ul>

{#if select.kind === 'pick'}
	<p class="count">{keys.length} of {select.n} chosen</p>
{:else if select.kind === 'many' && select.max}
	<p class="count">{keys.length} of {select.max} chosen</p>
{/if}

<style>
	.open-field {
		padding: 8px 0 2px 16px;
	}

	/* --- row with a thumbnail --------------------------------------------- */

	.opt.tile {
		align-items: center;
		padding: 8px 14px 8px 8px;
	}

	.thumb {
		flex: 0 0 96px;
		width: 96px;
		height: 72px;
		object-fit: cover;
		border-radius: 8px;
		display: block;
		background: var(--card-solid);
	}

	.label {
		flex: 1;
		min-width: 0;
	}

	/* --- 2-column image cards (≤4 options, all illustrated) ---------------- */

	.options.cards {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.card {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 4 / 3;
		padding: 0;
		overflow: hidden;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--card-solid);
		color: var(--ink);
		text-align: left;
		cursor: pointer;
		transition: box-shadow 0.12s ease, border-color 0.12s ease;
	}

	.card-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.card-shade {
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, rgba(10, 16, 32, 0) 40%, rgba(10, 16, 32, 0.9) 100%);
	}

	.card-label {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 10px;
		font-size: 15px;
		line-height: 1.25;
	}

	.card-check {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--gold);
		color: #10192a;
		font-size: 14px;
		font-weight: 700;
		line-height: 24px;
		text-align: center;
		opacity: 0;
		transform: scale(0.6);
		transition: opacity 0.12s ease, transform 0.12s ease;
	}

	.card[aria-pressed='true'] {
		border-color: var(--gold);
		box-shadow: 0 0 0 2px var(--gold);
	}

	.card[aria-pressed='true'] .card-check {
		opacity: 1;
		transform: scale(1);
	}
</style>
