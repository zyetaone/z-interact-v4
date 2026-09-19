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
</script>

<ul class="options">
	{#each question.options as option (option.key)}
		{@const picked = keys.includes(option.key)}
		<li>
			<button type="button" class="opt" aria-pressed={picked} onclick={() => toggle(option.key)}>
				<span class="mark"></span>
				<span>{option.label}</span>
			</button>
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
</style>
