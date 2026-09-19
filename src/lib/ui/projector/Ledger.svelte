<script lang="ts">
	/**
	 * THE ROOM LEDGER — what the two small televisions show.
	 *
	 * The design review's §4: the TVs are ceiling-mounted above head height
	 * and a 65-inch panel at 20 m subtends a fraction of what the LED wall
	 * does, so mirroring the wall's tiles and grids on them produces two
	 * screens of unreadable texture. They get three slow-changing lines in
	 * the largest type on any surface instead, so someone with their back
	 * to the stage can rejoin the session from those lines alone.
	 *
	 * Opt-in via `?surface=ledger`, because a 16:9 frame is equally likely
	 * to be a rehearsal laptop, and a laptop should show the wall. Point
	 * the two TVs at the ledger URL on the night.
	 *
	 * Still no future names: the lens is hidden analysis on every surface.
	 */
	import { stillAnswering } from './grouping';
	import type { ProjectorBeat, TableView } from './types';

	let {
		beat,
		tables,
		focusTable
	}: { beat: ProjectorBeat; tables: TableView[]; focusTable: number | null } = $props();

	/** What the room should be doing right now, in the imperative, one line. */
	const INSTRUCTION: Record<ProjectorBeat, string> = {
		lobby: 'Scan the card on your table',
		progress: 'Answer on your phone',
		reveal: 'Look up',
		focus: 'Look up',
		finale: 'Look up'
	};

	// Unsubmitted tables only — see `stillAnswering`. A table whose render
	// failed is the desk's problem, not something to put in front of the
	// room on the surface people use to work out whether to keep going.
	const answering = $derived(stillAnswering(tables));
</script>

<section class="ledger">
	<p class="instruction">{INSTRUCTION[beat]}</p>
	{#if answering > 0}
		<p class="line">
			<span class="n">{answering}</span>
			<span class="what">{answering === 1 ? 'table still answering' : 'tables still answering'}</span>
		</p>
	{:else}
		<p class="line"><span class="what">every table is in</span></p>
	{/if}
	<p class="line">
		{#if focusTable}
			<span class="what">on the wall</span>
			<span class="n">{focusTable}</span>
		{:else}
			<span class="what">on the wall: every table</span>
		{/if}
	</p>
</section>

<style>
	.ledger {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4vh;
		padding: 4vh;
		text-align: center;
	}
	/* The largest type on any surface in the room — the review's phrase, and
	   the reason this screen exists rather than a shrunken copy of the wall. */
	.instruction {
		margin: 0;
		font-family: 'Playfair Display', Georgia, serif;
		font-size: 16vh;
		line-height: 1;
		color: var(--gold);
	}
	.line {
		margin: 0;
		display: flex;
		align-items: baseline;
		gap: 0.4em;
		font-size: 9vh;
		line-height: 1;
	}
	.n {
		font-family: 'Playfair Display', Georgia, serif;
		font-weight: 700;
	}
	.what {
		color: var(--ink-muted);
	}
</style>
