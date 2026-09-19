<script lang="ts">
	/**
	 * Screens 4-13 — one question per screen. The stem is verbatim; Q4 and
	 * Q9 additionally carry a one-line `lead` shown just under the stem
	 * before their facet options. The Push line is printed ONCE (design-
	 * review.md fix 8): where the question captures a reply (Q2, Q10) it is
	 * the field's label and nothing else; where it is only spoken at the
	 * table it is a `.talk` prompt, styled apart from any field label so it
	 * never looks like a question with nowhere to answer.
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
		saving,
		failed,
		onchange,
		onpush,
		onnext
	}: {
		question: Question;
		keys: string[];
		texts: Record<string, string>;
		pushReply: string;
		saving: boolean;
		failed: string;
		onchange: (keys: string[], texts: Record<string, string>) => void;
		onpush: (text: string) => void;
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

<OptionList {question} {keys} {texts} {onchange} />

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
		<p class="count note">Optional — added to the prompt word for word.</p>
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
	.push-field {
		margin-bottom: 18px;
	}
	.note {
		text-align: left;
	}
</style>
