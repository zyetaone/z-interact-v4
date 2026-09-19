<script lang="ts">
	/**
	 * Screen 3 + 3b + 3c on one card, per game-flow.md §0's fourth
	 * reconciliation: the future pick derives an era chip the table may
	 * nudge one step and no further, and Q1's push line becomes a real
	 * field only when the era lands on 2026.
	 *
	 * A blocked nudge is greyed **with its reason shown**, never silently
	 * refused — the reason comes from `era.ts`'s rules, not from prose
	 * written here.
	 */
	import { FUTURES } from '$lib/game/futures';
	import { eraVerdict, nudge, type Era } from '$lib/game/era';

	let {
		futureKey,
		era,
		protectReply,
		onpick,
		onera,
		onprotect,
		onskip,
		onnext
	}: {
		futureKey: string | null;
		era: Era | null;
		protectReply: string;
		onpick: (key: string) => void;
		onera: (era: Era) => void;
		onprotect: (text: string) => void;
		onskip: () => void;
		onnext: () => void;
	} = $props();

	const ERA_LABEL: Record<Era, string> = {
		'retro-1930s': '1930s reborn',
		'same-as-2026': 'Same as 2026',
		'recognisably-2035': '2035',
		'hyperfuturistic-2040': '2040'
	};

	const chosen = $derived(FUTURES.find((f) => f.key === futureKey) ?? null);
	const current = $derived(era ?? chosen?.eraDefault ?? null);

	function step(dir: 'earlier' | 'later'): { era: Era; verdict: 'ok' | 'warn' | 'blocked' } | null {
		if (!chosen || !current) return null;
		const next = nudge(current, dir);
		if (next === current) return null;
		return { era: next, verdict: eraVerdict(chosen, next) };
	}

	const earlier = $derived(step('earlier'));
	const later = $derived(step('later'));
	const warnNow = $derived(chosen && current ? eraVerdict(chosen, current) === 'warn' : false);
</script>

<h1 class="stem">Choose your lens.</h1>
<p class="hint">A worldview, not a character. It sets the light, the materials and the skyline.</p>

<ul class="futures">
	{#each FUTURES as future (future.key)}
		<li>
			<button
				type="button"
				class="opt future"
				aria-pressed={future.key === futureKey}
				onclick={() => onpick(future.key)}
			>
				<span class="mark"></span>
				<span class="body">
					<span class="name">{future.name}</span>
					<span class="prov">{future.provenance}</span>
					<span class="blurb">{future.blurb}</span>
				</span>
			</button>
		</li>
	{/each}
</ul>

{#if chosen && current}
	<section class="chip-row" aria-label="Era">
		<span class="field-label">What year is your office living in?</span>
		<div class="chips">
			<button
				type="button"
				class="chip nudge"
				disabled={!earlier || earlier.verdict === 'blocked'}
				onclick={() => earlier && onera(earlier.era)}>&larr;</button
			>
			<span class="chip now">{ERA_LABEL[current]}</span>
			<button
				type="button"
				class="chip nudge"
				disabled={!later || later.verdict === 'blocked'}
				onclick={() => later && onera(later.era)}>&rarr;</button
			>
		</div>

		{#if chosen.eraLocked}
			<p class="reason">
				{chosen.name} is fixed to {ERA_LABEL[chosen.eraDefault]} — any other era contradicts the card itself.
			</p>
		{:else if (earlier && earlier.verdict === 'blocked') || (later && later.verdict === 'blocked')}
			<p class="reason">{chosen.name} reaches one step either side of {ERA_LABEL[chosen.eraDefault]}, no further.</p>
		{/if}
		{#if warnNow}
			<p class="reason warn">Allowed, but it makes a duller picture than {chosen.name} usually gives you.</p>
		{/if}
	</section>

	{#if current === 'same-as-2026'}
		<section class="protect">
			<label class="field-label" for="protect">If the office stays the same, what are you protecting?</label>
			<textarea
				id="protect"
				class="field"
				rows="3"
				placeholder="Say what refusing to change is defending"
				value={protectReply}
				onchange={(e) => onprotect(e.currentTarget.value)}
			></textarea>
			<p class="count">Optional. Added to the prompt word for word.</p>
		</section>
	{/if}
{/if}

<div class="grow"></div>

<div class="actions">
	{#if chosen}
		<button class="btn" onclick={onnext}>Next</button>
	{:else}
		<button class="btn ghost" onclick={onskip}>No future fits us — skip</button>
	{/if}
</div>

<style>
	.futures {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 0 0 22px;
		padding: 0;
		list-style: none;
	}

	.future .body {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.name {
		font-family: var(--display);
		font-size: 19px;
	}

	.prov {
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--gold);
	}

	.blurb {
		font-size: 14px;
		line-height: 1.4;
		color: var(--ink-dim);
	}

	.chip-row {
		border-top: 1px solid var(--line);
		padding-top: 18px;
		margin-bottom: 18px;
	}

	.chips {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.chip {
		min-height: 48px;
		border-radius: 999px;
		border: 1px solid var(--line-strong);
		background: transparent;
		padding: 0 18px;
		font-size: 15px;
		cursor: pointer;
	}

	.chip.now {
		border-color: var(--gold);
		color: var(--gold);
		flex: 1;
		text-align: center;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.chip.nudge {
		flex: 0 0 52px;
		font-size: 18px;
	}

	.chip.nudge[disabled] {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.reason {
		font-size: 13px;
		line-height: 1.4;
		color: var(--ink-faint);
		margin: 10px 0 0;
	}

	.reason.warn {
		color: var(--warn);
	}

	.protect {
		margin-bottom: 18px;
	}
</style>
