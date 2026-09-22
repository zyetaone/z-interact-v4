<script lang="ts">
	/**
	 * THE BRAND, WITH ITS LAST GLYPH BREATHING.
	 *
	 * Split out when the waiting frame started showing it too — two call
	 * sites, and the "everything but the last character" split is the kind
	 * of logic that drifts if it is written twice.
	 *
	 * POSITIONAL, NEVER A NAMED LETTER. This repo carries no company name
	 * (CLAUDE.md's first rule) — the brand is a deploy value, `BRAND_LINE`.
	 * So this animates the FINAL character of whatever it is handed and
	 * cannot know which one that is. A one-character brand animates whole;
	 * an empty one renders nothing at all.
	 */
	let { line = '', note = '' }: { line?: string; note?: string } = $props();

	const mark = $derived.by(() => {
		const text = line.trim();
		if (!text) return null;
		return { head: text.slice(0, -1), tick: text.slice(-1) };
	});
</script>

{#if mark}
	<span class="wrap">
		<span class="mark">{mark.head}<span class="brand-tick">{mark.tick}</span></span>
		<!-- What is happening, in the table's language rather than the state
		     machine's. Carries no company name — that is the mark above it,
		     and it is a deploy value. -->
		{#if note}<span class="note">{note}</span>{/if}
	</span>
{/if}

<style>
	.wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		text-align: center;
		padding: 0 16px;
	}

	.note {
		font-family: var(--display);
		font-size: 17px;
		line-height: 1.35;
		letter-spacing: 0;
		text-transform: none;
		color: var(--ink-dim);
		max-width: 22ch;
	}

	.mark {
		font-size: 12px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-faint);
		white-space: nowrap;
	}
</style>
