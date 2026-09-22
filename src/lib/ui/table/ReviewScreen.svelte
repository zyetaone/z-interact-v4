<script lang="ts">
	/**
	 * Screen 15 — every answer as an editable row (tap one to go back to
	 * that screen) and the composed prompt in a text area the table may
	 * rewrite. A missing required answer flags its own row and the button
	 * names what is missing; a locked room disables the button and shows
	 * the gate's own reason rather than a generic one.
	 */
	import { FUTURES } from '$lib/game/futures';
	import { andId, WILDCARD } from '$lib/game/questions';
	import { FLOW_QUESTIONS, FUTURE_ID, type StatusAnswer } from '$lib/state/table.svelte';

	let {
		answers,
		prompt,
		editable = false,
		missing,
		canSubmit,
		gateReason,
		saving,
		onprompt,
		onedit,
		onsubmit
	}: {
		answers: Map<string, StatusAnswer>;
		prompt: string;
		/**
		 * Whether rewriting the prompt would reach the render. False in a
		 * hero room, where `composePromptFor` builds from the answers and
		 * never reads the edit — see `prompt-edit.test.ts`.
		 */
		editable?: boolean;
		missing: string[];
		canSubmit: boolean;
		gateReason: string;
		saving: boolean;
		onprompt: (text: string) => void;
		onedit: (stepKey: string) => void;
		onsubmit: () => void;
	} = $props();

	interface Row {
		key: string;
		stepKey: string;
		label: string;
		value: string;
	}

	function labelsFor(id: string): string {
		const answer = answers.get(id);
		if (!answer || answer.keys.length === 0) return '';
		if (id === FUTURE_ID) {
			if (answer.keys[0] === 'skipped') return 'Skipped — the house register';
			return FUTURES.find((f) => f.key === answer.keys[0])?.name ?? '';
		}
		if (id === WILDCARD.id) return answer.text?.[WILDCARD.options[0].key] ?? '';
		const question = FLOW_QUESTIONS.find((q) => q.id === id);
		if (!question) return answer.keys.join(', ');
		const picked = question.options
			.filter((o) => answer.keys.includes(o.key))
			.map((o) => {
				const typed = answer.text?.[o.key]?.trim();
				return typed ? `${o.label} — ${typed}` : o.label;
			})
			.join(' · ');
		// The "And:" pick rides on its parent's line — it has no row of its own.
		const andKey = answers.get(andId(id))?.keys[0];
		const andLabel = andKey ? question.and?.options.find((o) => o.key === andKey)?.label : undefined;
		return andLabel ? `${picked} · And: ${andLabel}` : picked;
	}

	const rows = $derived<Row[]>([
		{ key: FUTURE_ID, stepKey: 'future', label: 'Our future', value: labelsFor(FUTURE_ID) },
		...FLOW_QUESTIONS.map((q) => ({ key: q.id, stepKey: q.id, label: q.prompt, value: labelsFor(q.id) })),
		{ key: WILDCARD.id, stepKey: 'wildcard', label: 'Wildcard', value: labelsFor(WILDCARD.id) }
	]);
</script>

<h1 class="stem">Our answers</h1>
<p class="hint">Tap any line to change it.</p>

<ul class="rows">
	{#each rows as row (row.key)}
		<li>
			<button type="button" class="row" class:flagged={missing.includes(row.key)} onclick={() => onedit(row.stepKey)}>
				<span class="q">{row.label}</span>
				<span class="a">{row.value || 'Not answered yet'}</span>
			</button>
		</li>
	{/each}
</ul>

<!-- COLLAPSED BY DEFAULT. This was a ten-row textarea, open, between the
     answers and the only button on the screen — so the last thing a table
     saw before drawing was 1,900 characters of machine instructions, and
     the submit button was pushed off the bottom of a 390x844 phone.

     Read-only unless an edit could actually reach the render: in a hero
     room the composer builds from the answers and throws the edited string
     away, after storing it and flagging the row `editedByTable`. Showing
     an editable box there is the screen telling the table something the
     renderer does not honour. -->
<details class="prompt-box">
	<summary>
		<span class="field-label">The prompt for our workspace</span>
		<span class="note">{editable ? 'tap to read or rewrite' : 'tap to read'}</span>
	</summary>
	{#if editable}
		<textarea id="composed" class="field" rows="10" value={prompt} onchange={(e) => onprompt(e.currentTarget.value)}
		></textarea>
	{:else}
		<p id="composed" class="prompt-read">{prompt}</p>
	{/if}
</details>

{#if !canSubmit && gateReason}
	<p class="banner">{gateReason}</p>
{/if}

<div class="actions">
	<button class="btn" disabled={!canSubmit || saving || missing.length > 0} onclick={onsubmit}>
		{#if missing.length > 0}
			Still missing {missing.length} answer{missing.length === 1 ? '' : 's'}
		{:else if saving}
			Sending…
		{:else}
			Draw our workspace
		{/if}
	</button>
</div>

<style>
	.rows {
		list-style: none;
		margin: 0 0 22px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
		border-top: 1px solid var(--line);
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 3px;
		width: 100%;
		text-align: left;
		background: transparent;
		border: 0;
		border-bottom: 1px solid var(--line);
		padding: 13px 2px;
		cursor: pointer;
		min-height: 56px;
	}

	.row.flagged {
		border-left: 3px solid var(--warn);
		padding-left: 10px;
	}

	.q {
		font-size: 12px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-faint);
	}

	.a {
		font-size: 15px;
		line-height: 1.35;
		color: var(--ink);
	}

	.prompt-box {
		margin-bottom: 18px;
	}
	/* A 44px row, not a 13px inline caret: this is tapped on a passed phone. */
	.prompt-box summary {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		min-height: 44px;
		padding: 10px 0;
		cursor: pointer;
		border-top: 1px solid var(--line);
	}

	.prompt-box summary .note {
		color: var(--gold);
		font-size: 13px;
		letter-spacing: 0.04em;
	}

	.prompt-read {
		margin: 0 0 8px;
		font-size: 14px;
		line-height: 1.5;
		opacity: 0.8;
	}
</style>