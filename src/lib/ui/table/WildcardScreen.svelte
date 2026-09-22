<script lang="ts">
	/** Screen 14 — optional, 140 characters, appended to the prompt verbatim. */
	import { WILDCARD } from '$lib/game/questions';

	let {
		text,
		saving,
		onchange,
		onadd,
		onskip
	}: {
		text: string;
		saving: boolean;
		onchange: (text: string) => void;
		onadd: () => void;
		onskip: () => void;
	} = $props();

	const LIMIT = 140;
	const over = $derived(text.length > LIMIT);
</script>

<h1 class="stem">{WILDCARD.prompt}</h1>
<!-- THE PROMISE. CLAUDE.md records this screen as promising that whatever
     the table writes "goes into the drawing exactly as you write it" — and
     it did not say so anywhere. It is the sentence that earns a good answer
     rather than a shrug, and since the 21 Sep fix it is also TRUE on the
     hero path, which is the only path most rooms render. -->
<p class="hint">Whatever it is, it goes into the drawing exactly as you write it.</p>

<textarea
	class="field"
	rows="4"
	aria-label={WILDCARD.prompt}
	placeholder="One idea, in your own words"
	value={text}
	oninput={(e) => onchange(e.currentTarget.value)}
></textarea>
<p class="count" class:over>{text.length} / {LIMIT}</p>

<div class="grow"></div>

<div class="actions">
	<button class="btn ghost" onclick={onskip}>Skip</button>
	<button class="btn" disabled={over || saving || !text.trim()} onclick={onadd}>
		{saving ? 'Saving…' : 'Add'}
	</button>
</div>
