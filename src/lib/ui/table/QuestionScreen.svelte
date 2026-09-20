<script lang="ts">
	/**
	 * One question per screen. The stem is verbatim; V4's Q4, Q5 and Q6
	 * carry a `lead` shown just under the stem before their options. The
	 * Push line is printed ONCE (design-review.md fix 8): where the question
	 * captures a reply (q2, q5c) it is the field's label and nothing else;
	 * where it is only spoken at the table it is a `.talk` prompt, styled
	 * apart from any field label so it never looks like a question with
	 * nowhere to answer.
	 *
	 * V4's "And:" sub-question is a compact single-select chip row under
	 * the options, in the era chip's style (`FutureScreen`). It is optional
	 * and never blocks Next; its pick is stored as its own row under
	 * `${id}:and` (`andId`), so the parent answer's row is untouched.
	 *
	 * The screen never advances on an unsaved answer: a failed save leaves
	 * the selection on screen with a retry banner (game-flow.md §1).
	 */
	import type { Question } from '$lib/game/questions';
	import OptionList from './OptionList.svelte';

	let {
		question,
		keys,
		texts,
		pushReply,
		andKey,
		saving,
		failed,
		onchange,
		onpush,
		onand,
		onnext
	}: {
		question: Question;
		keys: string[];
		texts: Record<string, string>;
		pushReply: string;
		/** The "And:" pick, or null when the table has not (or no longer) chosen one. */
		andKey: string | null;
		saving: boolean;
		failed: string;
		onchange: (keys: string[], texts: Record<string, string>) => void;
		onpush: (text: string) => void;
		onand: (key: string | null) => void;
		onnext: () => void;
	} = $props();

	const minimum = $derived(
		question.select.kind === 'pick' ? question.select.n : question.select.kind === 'many' ? (question.select.min ?? 1) : 1
	);
	const ready = $derived(keys.length >= minimum);
</script>

<h1 class="stem">{question.prompt}</h1>
{#if question.lead}
	<p class="lead">{question.lead}</p>
{/if}
{#if question.push && !question.pushCapturesReply}
	<p class="talk"><span class="push-label">Talk</span><span>{question.push}</span></p>
{/if}

{#if failed}
	<p class="banner">{failed}</p>
{/if}

{#if question.and}
	<!-- The cue, not the row. On a phone the "And:" chips sit under a full
	     screen of options and a table that never scrolls past Next simply
	     never sees them. A plain in-page anchor (no JS, no scroll handler)
	     jumps to the row that is already there; the row itself, its
	     placement and its optionality are unchanged. -->
	<p class="and-cue"><a href="#and-{question.id}"><span aria-hidden="true">&#8595;</span> And: {question.and.prompt}</a></p>
{/if}

<OptionList {question} {keys} {texts} {onchange} />

{#if question.and}
	<section class="chip-row" aria-label={question.and.prompt}>
		<span class="field-label" id="and-{question.id}">And: {question.and.prompt}</span>
		<div class="chips" role="radiogroup" aria-labelledby="and-{question.id}">
			{#each question.and.options as option (option.key)}
				{@const picked = option.key === andKey}
				<button
					type="button"
					role="radio"
					class="chip"
					aria-checked={picked}
					onclick={() => onand(picked ? null : option.key)}>{option.label}</button
				>
			{/each}
		</div>
		<p class="count note">Optional.</p>
	</section>
{/if}

{#if question.pushCapturesReply && question.push}
	<section class="push-field">
		<label class="field-label" for="push">{question.push}</label>
		<textarea
			id="push"
			class="field"
			rows="2"
			placeholder="In your own words"
			value={pushReply}
			onchange={(e) => onpush(e.currentTarget.value)}
		></textarea>
		<p class="count note">
			{question.pushNotDrawn ? 'Optional — kept with your answers for the wall, not drawn.' : 'Optional — added to the prompt word for word.'}
		</p>
	</section>
{/if}

<div class="grow"></div>

<div class="actions">
	<button class="btn" disabled={!ready || saving} onclick={onnext}>
		{saving ? 'Saving…' : 'Next'}
	</button>
</div>

<style>
	.lead {
		margin: -8px 0 12px;
		opacity: 0.85;
	}

	.and-cue {
		font-size: 13px;
		letter-spacing: 0.04em;
		margin: 0 0 12px;
	}

	.and-cue a {
		color: var(--gold);
	}

	/* The era chip's row (FutureScreen), as a radiogroup that wraps. */
	.chip-row {
		border-top: 1px solid var(--line);
		padding-top: 18px;
		margin: 18px 0;
		/* The anchor lands on the label, not flush against the viewport edge. */
		scroll-margin-top: 16px;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.chip {
		min-height: 44px;
		border-radius: 999px;
		border: 1px solid var(--line-strong);
		background: transparent;
		color: var(--ink);
		padding: 0 16px;
		font-size: 15px;
		cursor: pointer;
		transition:
			border-color 0.12s ease,
			color 0.12s ease;
	}

	.chip[aria-checked='true'] {
		border-color: var(--gold);
		color: var(--gold);
	}
	.push-field {
		margin-bottom: 18px;
	}
	.note {
		text-align: left;
	}
</style>
