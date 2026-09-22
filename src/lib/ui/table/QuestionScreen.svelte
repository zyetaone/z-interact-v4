<script lang="ts">
	/**
	 * One question per screen: the stem, the options, and the typed reply.
	 *
	 * NOTHING EXPLAINS THE SCREEN TO THE TABLE ANY MORE. The lead line under
	 * the stem, the "And:" chip row and its anchor cue, and the sentence
	 * under the text box saying where the words go are all gone — the
	 * 21 Sep 22:26 review, which marked this class of copy on screen after
	 * screen. A question, six words to choose from and a box to write in do
	 * not need a paragraph telling a room of adults what they are.
	 *
	 * The push line is the FIELD'S LABEL and appears once (design-review.md
	 * fix 8). Every question captures a reply now, so the spoken-only "Talk"
	 * variant has no question left to render and went with the rest.
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
	</section>
{/if}

<div class="grow"></div>

<div class="actions">
	<button class="btn" disabled={!ready || saving} onclick={onnext}>
		{saving ? 'Saving…' : 'Next'}
	</button>
</div>

<style>
	.push-field {
		margin-bottom: 18px;
	}
</style>
