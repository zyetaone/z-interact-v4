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
	 * IT SAYS "OPTIONAL", because it always was and only the code knew. `ready`
	 * counts selected options and has never looked at this field, so Next has
	 * always enabled without a word typed — but the label is an imperative
	 * ("Name two materials you would want to touch."), which a table under
	 * time pressure reads as a thing it must do. Four of these, plus the
	 * wildcard, is five typing events invented by punctuation. The wildcard
	 * screen has always said so out loud with its Skip button; this is the
	 * same promise on the four screens that were only implying it.
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
	/**
	 * AN OPEN OPTION IS NOT ANSWERED UNTIL IT IS WRITTEN IN.
	 *
	 * "Somewhere from our imagination" has `promptFragment: '{text}'` — it is
	 * the one option in the app whose entire contribution is the table's own
	 * words. Picked and left blank it composes nothing, so the deep-work
	 * layer disappears from the prompt and nothing anywhere says so: the
	 * table taps Next, sees its picture, and the question it answered is
	 * simply not in it.
	 *
	 * The composer is already safe (no text, no clause, no dangling lead-in).
	 * Safe is not the same as served.
	 */
	const openUnfilled = $derived(
		keys.some((k) => {
			const option = question.options.find((o) => o.key === k);
			return option?.open && !(texts[k] ?? '').trim();
		})
	);
	const ready = $derived(keys.length >= minimum && !openUnfilled);
</script>

<h1 class="stem">{question.prompt}</h1>

{#if failed}
	<p class="banner">{failed}</p>
{/if}

<OptionList {question} {keys} {texts} {onchange} />

{#if question.pushCapturesReply && question.push}
	<section class="push-field">
		<label class="field-label" for="push">
			{question.push}<span class="optional">optional</span>
		</label>
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

	/* Set apart from the label rather than appended to it: the label is a
	   sentence a table reads, and "… you would want to touch. OPTIONAL" reads
	   as part of the sentence. A separate token reads as a property of the
	   field. */
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
</style>
