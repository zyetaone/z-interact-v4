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
	 *
	 * Semantics (design-review.md fix 5): a single-select question is a
	 * `radiogroup` of `radio`s, everything else a `group` of `checkbox`es,
	 * each carrying `aria-checked` — so a screen reader hears "checkbox,
	 * checked, 2 of 6" rather than "button, pressed". Every option stays in
	 * the tab order (no roving tabindex — a deliberate simplification for a
	 * touch-first flow). The running count and the maximum sit ABOVE the
	 * options in a live region, stated before the first tap.
	 *
	 * Rendering: a fully-illustrated question is a 2-column 1:1 tile grid
	 * with the caption below the tile; a question with an open option stays
	 * a row list, with a thumbnail on the rows that have one.
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
	const single = $derived(select.kind === 'one');
	const limit = $derived(
		select.kind === 'pick' ? select.n : select.kind === 'many' && select.max ? select.max : Infinity
	);

	/** "0 of 3 · pick exactly 3", "1 of 3 · choose up to 3", or "choose one" — the rule before the first tap. */
	const countLine = $derived.by(() => {
		if (select.kind === 'pick') return { n: `${keys.length} of ${select.n}`, rule: `pick exactly ${select.n}` };
		if (select.kind === 'many' && select.max) return { n: `${keys.length} of ${select.max}`, rule: `choose up to ${select.max}` };
		if (select.kind === 'many') return { n: keys.length ? `${keys.length} chosen` : '', rule: 'choose as many as fit' };
		return { n: '', rule: 'choose one' };
	});

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

	/**
	 * `visualCues: false` (21 Sep 19:42, "No visual cues") makes this screen
	 * a plain list of words. The art is not deleted — it still ships, still
	 * prints in the question book, and is still what `visuals-manifest.ts`
	 * describes. It simply stops being how a table chooses.
	 *
	 * Gated HERE rather than at each call site so nothing downstream can
	 * accidentally reach a picture: the tile grid, the row thumbnail and the
	 * slider's preview all resolve through this one function.
	 */
	const showImages = $derived('visualCues' in question ? question.visualCues !== false : true);

	function imageOf(key: string): string | undefined {
		if (!showImages) return undefined;
		return hasOptionImage(question.id, key) ? OPTION_IMAGE[`${question.id}:${key}`] : undefined;
	}

	const tiles = $derived(showImages && question.options.every((o) => hasOptionImage(question.id, o.key)));

	/* --- the percentage slider (questions.ts's `slider`) -------------------
	   A different way to pick ONE of the same options, not a different kind
	   of answer: `commit` calls the same `toggle` every tile calls, so the
	   row written server-side is identical to the one a tap would write.

	   An untouched slider must not read as an answer — the table has to
	   choose. So the thumb rests in the middle with no option selected, and
	   `picked` stays null until they move it. That is also why the caption
	   says "drag to choose" rather than naming the middle option.

	   `oninput` alone would strand exactly one option: a range fires input
	   only when its value CHANGES, so a table whose answer is the middle
	   stop — the one the untouched thumb already sits on — could press it
	   and get nothing. `onpointerup`/`onkeyup` commit whatever is showing. */
	const slider = $derived('slider' in question ? question.slider : undefined);
	const sliderIndex = $derived(question.options.findIndex((o) => keys.includes(o.key)));
	const restIndex = $derived(Math.floor((question.options.length - 1) / 2));
	const sliderValue = $derived(sliderIndex >= 0 ? sliderIndex : restIndex);
	const sliderOption = $derived(sliderIndex >= 0 ? question.options[sliderIndex] : undefined);

	function commit(raw: string) {
		const option = question.options[Number(raw)];
		if (option && !keys.includes(option.key)) toggle(option.key);
	}
</script>

{#if slider}
	{@const percent = slider[sliderValue]}
	{@const img = sliderOption ? imageOf(sliderOption.key) : undefined}
	<section class="slider" aria-label={question.prompt}>
		<p class="readout">
			<span class="percent" class:unset={!sliderOption}>{sliderOption ? `${percent}%` : '—'}</span>
			<span class="caption">{sliderOption ? sliderOption.label : 'Drag to choose'}</span>
		</p>
		{#if img}
			<img class="preview" src={img} alt="" />
		{/if}
		<input
			type="range"
			min="0"
			max={question.options.length - 1}
			step="1"
			value={sliderValue}
			aria-label={question.prompt}
			aria-valuetext={sliderOption ? `${percent} percent — ${sliderOption.label}` : 'not chosen yet'}
			oninput={(e) => commit(e.currentTarget.value)}
			onpointerup={(e) => commit(e.currentTarget.value)}
			onkeyup={(e) => commit(e.currentTarget.value)}
		/>
		<p class="ends">
			<span>{slider[0]}% indoors</span>
			<span>{slider[slider.length - 1]}% outdoors</span>
		</p>
	</section>
{:else}

<!-- The rule is printed only when there IS one. "choose one" under a list
     of radio buttons is a label for a behaviour the control already has;
     "1 of 3 · pick exactly 3" is information a table cannot get any other
     way, so that one stays. -->
{#if !single}
	<p class="count-lead" aria-live="polite">
		{#if countLine.n}<strong>{countLine.n}</strong><span class="sep">·</span>{/if}{countLine.rule}
	</p>
{/if}

<ul class="options" class:tiles role={single ? 'radiogroup' : 'group'} aria-label={question.prompt}>
	{#each question.options as option (option.key)}
		{@const picked = keys.includes(option.key)}
		{@const img = imageOf(option.key)}
		<li>
			{#if img && tiles}
				<button
					type="button"
					role={single ? 'radio' : 'checkbox'}
					class="card"
					aria-checked={picked}
					onclick={() => toggle(option.key)}
				>
					<span class="card-frame">
						<img class="card-img" src={img} alt="" loading="lazy" />
						<span class="card-check" aria-hidden="true">&#10003;</span>
					</span>
					<span class="card-label">{option.label}</span>
				</button>
			{:else}
				<button
					type="button"
					role={single ? 'radio' : 'checkbox'}
					class="opt"
					class:tile={!!img}
					aria-checked={picked}
					onclick={() => toggle(option.key)}
				>
					{#if img}
						<img class="thumb" src={img} alt="" loading="lazy" />
					{/if}
					<span class="mark"></span>
					<span class="label">{option.label}</span>
				</button>
			{/if}
			{#if option.open && picked}
				<div class="open-field">
					<textarea
						class="field"
						rows="2"
						placeholder="In your own words"
						aria-label="{option.label} — in your own words"
						value={texts[option.key] ?? ''}
						oninput={(e) => setText(option.key, e.currentTarget.value)}
					></textarea>
				</div>
			{/if}
		</li>
	{/each}
</ul>
{/if}

<style>
	/* --- the percentage slider -------------------------------------------- */

	.slider {
		margin-bottom: 18px;
	}

	.readout {
		display: flex;
		align-items: baseline;
		gap: 10px;
		margin: 0 0 12px;
	}

	.percent {
		font-family: var(--display, Georgia, serif);
		font-size: 2rem;
		line-height: 1;
		color: var(--gold);
	}

	.percent.unset {
		color: var(--muted);
	}

	.caption {
		flex: 1;
		min-width: 0;
		font-size: 15px;
		line-height: 1.3;
	}

	.preview {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: var(--radius);
		border: 1px solid var(--line);
		display: block;
		margin-bottom: 12px;
		background: var(--card-solid);
	}

	/* A thumb big enough for a thumb. The browser default is ~12px, which is
	   below the 44px target the rest of this flow holds to. */
	.slider input[type='range'] {
		width: 100%;
		height: 44px;
		accent-color: var(--gold);
	}

	.ends {
		display: flex;
		justify-content: space-between;
		margin: 0;
		font-size: 13px;
		color: var(--muted);
	}

	/* --- the option list --------------------------------------------------- */

	.open-field {
		padding: 8px 0 2px 16px;
	}

	.sep {
		margin: 0 6px;
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
		filter: brightness(0.75);
		transition: filter 0.12s ease;
	}

	.opt[aria-checked='true'] .thumb {
		filter: brightness(1);
	}

	.label {
		flex: 1;
		min-width: 0;
	}

	/* --- 2-column 1:1 tiles, caption below (design-review.md §3) ----------- */

	.options.tiles {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px 10px;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--ink);
		text-align: left;
		cursor: pointer;
		border-radius: var(--radius);
	}

	.card-frame {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 1 / 1;
		overflow: hidden;
		border: 2px solid var(--line);
		border-radius: var(--radius);
		background: var(--card-solid);
		transition: border-color 0.12s ease;
	}

	.card-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		filter: brightness(0.75);
		transition: filter 0.12s ease;
	}

	.card-label {
		font-size: 14px;
		line-height: 1.3;
		padding: 0 2px;
	}

	.card-check {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--gold);
		color: #10192a;
		font-size: 15px;
		font-weight: 700;
		line-height: 26px;
		text-align: center;
		opacity: 0;
		transform: scale(0.6);
		transition:
			opacity 0.12s ease,
			transform 0.12s ease;
	}

	.card[aria-checked='true'] .card-frame {
		border-color: var(--gold);
	}

	.card[aria-checked='true'] .card-img {
		filter: brightness(1);
	}

	.card[aria-checked='true'] .card-label {
		color: var(--gold);
	}

	.card[aria-checked='true'] .card-check {
		opacity: 1;
		transform: scale(1);
	}
</style>
