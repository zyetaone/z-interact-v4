<script lang="ts">
	/**
	 * THE READOUT — what the room said, whether it is moving, what it cost.
	 *
	 * Behind the same `?token=` gate as the desk and reached from it. It
	 * READS: no beats, no redraws, no resets, nothing that spends. The one
	 * control is Refresh, because a page that reloads itself while someone
	 * is reading a column of typed replies is a page that loses their place.
	 *
	 * ponytail: bars are a div with a width, not a chart library. Twenty
	 * tables and eleven questions do not need one, and a projector-grade
	 * chart is not what a facilitator squinting at a laptop between beats
	 * is asking for.
	 */
	import '../../../app.css';
	import { page } from '$app/state';
	import { roomAnalytics } from '../analytics.remote';
	import { ALL_FUTURES } from '$lib/game/futures';

	const token = page.url.searchParams.get('token') ?? '';

	let result = $state.raw(await roomAnalytics({ token }));
	let busy = $state(false);

	async function refresh() {
		busy = true;
		try {
			result = await roomAnalytics({ token });
		} finally {
			busy = false;
		}
	}

	const a = $derived(result.ok ? result.analytics : null);
	const lensName = (key: string | null) => ALL_FUTURES.find((f) => f.key === key)?.name ?? '—';
	const pct = (share: number) => `${Math.round(share * 100)}%`;
	const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
</script>

<svelte:head><title>Room readout</title></svelte:head>

<div class="root">
	<header>
		<h1>Room readout</h1>
		<div class="actions">
			<a class="btn" href="/admin?token={token}">← Desk</a>
			<button class="btn" onclick={refresh} disabled={busy}>{busy ? 'Reading…' : 'Refresh'}</button>
		</div>
	</header>

	{#if !result.ok}
		<p class="empty">Can't read the room: {result.reason}</p>
	{:else if a}
		<p class="asof">As of {clock(a.generatedAt)}. This page reads only — it never ticks a render or spends.</p>

		<section class="tiles">
			<div class="tile"><b>{a.totals.started}</b><span>of {a.totals.tables} tables started</span></div>
			<div class="tile"><b>{a.totals.submitted}</b><span>submitted</span></div>
			<div class="tile"><b>{a.totals.stored}</b><span>tiles drawn</span></div>
			<div class="tile" class:warn={a.totals.pending > 0}><b>{a.totals.pending}</b><span>still drawing</span></div>
			<div class="tile" class:bad={a.totals.failed > 0}><b>{a.totals.failed}</b><span>failed</span></div>
			<div class="tile"><b>{a.spend.renders}</b><span>renders spent · cap {a.spend.cap}/table</span></div>
		</section>

		{#if a.spend.tablesAtCap.length > 0 || a.spend.reasons.length > 0}
			<section class="panel">
				<h2>Cost and failures</h2>
				{#if a.spend.tablesAtCap.length > 0}
					<p class="note bad">At the cap, cannot draw again: tables {a.spend.tablesAtCap.join(', ')}</p>
				{/if}
				{#if a.spend.reasons.length > 0}
					<ul class="reasons">
						{#each a.spend.reasons as r (r.reason)}
							<li><b>{r.count}×</b> {r.reason}</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		<!-- CARRIED FROM v3, whose presenter computed these and put them on the
		     wall. Everything else on this page answers "is the event working";
		     these two answer "what did the room decide", which is what the
		     room came to find out — and they are the only lines here a
		     facilitator can read out as they are. Absent until two tables have
		     answered, because one table is unanimous with itself. -->
		{#if a.consensus || a.divisive}
			<section class="panel">
				<h2>What the room decided</h2>
				{#if a.consensus}
					<p class="verdict-line">
						<span class="verdict-label">Most agreed</span>
						<b>{pct(a.consensus.share)}</b> chose <b>{a.consensus.label}</b>
						<span class="verdict-q">{a.consensus.prompt}</span>
					</p>
				{/if}
				{#if a.divisive}
					<p class="verdict-line">
						<span class="verdict-label">Most split</span>
						<b>{pct(a.divisive.share)}</b> {a.divisive.label}
						against <b>{pct(a.divisive.againstShare ?? 0)}</b> {a.divisive.againstLabel}
						<span class="verdict-q">{a.divisive.prompt}</span>
					</p>
				{/if}
			</section>
		{/if}

		<section class="panel">
			<h2>The lens the room chose</h2>
			{#each a.lenses as lens (lens.key)}
				<div class="row">
					<span class="label">{lens.name}</span>
					<span class="bar"><i style:width={a.totals.started ? pct(lens.count / a.totals.started) : '0%'}></i></span>
					<span class="n">{lens.count}</span>
				</div>
			{/each}
		</section>

		{#each a.questions as q (q.questionId)}
			<section class="panel">
				<h2>{q.prompt}</h2>
				<p class="note">{q.answered} of {a.totals.tables} tables answered</p>
				{#each q.options as o (o.key)}
					<div class="row" class:zero={o.count === 0}>
						<!-- The full option text on hover: these labels are long by design and the column truncates them. -->
						<span class="label" title={o.label}>{o.label}</span>
						<span class="bar"><i style:width={pct(o.share)}></i></span>
						<span class="n">{o.count}</span>
					</div>
				{/each}
				{#if q.replies.length > 0}
					<ul class="replies">
						{#each q.replies as r, i (`${r.table}-${i}`)}
							<li><b>T{r.table}</b> {r.text}</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/each}

		{#if a.wildcards.length > 0}
			<section class="panel">
				<h2>The wildcard — what tables volunteered</h2>
				<ul class="replies">
					{#each a.wildcards as w, i (`${w.table}-${i}`)}
						<li><b>T{w.table}</b> {w.text}</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="panel">
			<h2>Table by table</h2>
			<table>
				<thead>
					<tr><th>Table</th><th>Lens</th><th>Answers</th><th>Submitted</th><th>Mins</th><th>Tiles</th><th>Renders</th></tr>
				</thead>
				<tbody>
					{#each a.tables as t (t.table)}
						<tr>
							<td>{t.table}</td>
							<td>{lensName(t.futureKey)}</td>
							<td>{t.answered}</td>
							<td>{t.submittedAt ? clock(t.submittedAt) : '—'}</td>
							<td>{t.minutesToSubmit ?? '—'}</td>
							<td>
								{t.stored}✓{#if t.pending}<span class="warn"> {t.pending}…</span>{/if}{#if t.failed}<span class="bad"> {t.failed}✗</span>{/if}
							</td>
							<td class:bad={t.atCap}>{t.renders}/{a.spend.cap}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}
</div>

<style>
	.verdict-line {
		margin: 0 0 12px;
		font-size: 17px;
		line-height: 1.5;
	}
	.verdict-line:last-child {
		margin-bottom: 0;
	}
	.verdict-label {
		display: block;
		font-size: 12px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-faint);
		margin-bottom: 2px;
	}
	.verdict-q {
		display: block;
		font-size: 14px;
		color: var(--ink-faint);
		margin-top: 2px;
	}

	/* The desk's tokens (app.css): navy ground, gold accent, no white. */
	.root {
		min-height: 100dvh;
		padding: 20px 24px 60px;
		color: var(--ink);
		max-width: 1100px;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 4px;
	}
	h1 {
		font-family: var(--display);
		font-size: 22px;
		margin: 0;
		color: var(--gold);
	}
	.actions {
		display: flex;
		gap: 8px;
	}
	.btn {
		min-height: 40px;
		padding: 0 14px;
		display: inline-flex;
		align-items: center;
		border-radius: 10px;
		border: 1px solid var(--line-strong);
		background: var(--card-solid);
		color: var(--ink);
		font: inherit;
		text-decoration: none;
		cursor: pointer;
	}
	.btn:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.asof,
	.note {
		color: var(--ink-dim);
		font-size: 13px;
		margin: 6px 0 16px;
	}
	.empty {
		margin-top: 24px;
		padding: 16px;
		border-radius: var(--radius);
		border: 1px solid var(--line-strong);
		background: var(--card-solid);
	}
	.tiles {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-bottom: 20px;
	}
	.tile {
		flex: 1 1 140px;
		padding: 12px 14px;
		border-radius: var(--radius);
		border: 1px solid var(--line);
		background: var(--card-solid);
	}
	.tile b {
		display: block;
		font-family: var(--display);
		font-size: 28px;
		color: var(--gold);
	}
	.tile span {
		font-size: 12px;
		color: var(--ink-dim);
	}
	.tile.warn b {
		color: var(--warn);
	}
	.tile.bad b,
	.bad {
		color: #e0475c;
	}
	.warn {
		color: var(--warn);
	}
	.panel {
		padding: 14px 16px;
		margin-bottom: 14px;
		border-radius: var(--radius);
		border: 1px solid var(--line);
		background: var(--card);
	}
	h2 {
		font-size: 15px;
		margin: 0 0 8px;
		color: var(--ink);
	}
	.row {
		display: grid;
		grid-template-columns: minmax(120px, 2fr) 3fr 40px;
		gap: 10px;
		align-items: center;
		padding: 3px 0;
		font-size: 13px;
	}
	.row.zero {
		opacity: 0.45;
	}
	.label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bar {
		height: 10px;
		border-radius: 5px;
		background: rgba(244, 237, 224, 0.1);
		overflow: hidden;
	}
	.bar i {
		display: block;
		height: 100%;
		background: var(--gold);
	}
	.n {
		text-align: right;
		color: var(--ink-dim);
	}
	.replies {
		margin: 10px 0 0;
		padding: 10px 0 0;
		border-top: 1px solid var(--line);
		list-style: none;
		font-size: 13px;
	}
	.replies li {
		padding: 3px 0;
		color: var(--ink-dim);
	}
	.replies b,
	.reasons b {
		color: var(--gold);
		margin-right: 6px;
	}
	.reasons {
		margin: 6px 0 0;
		padding-left: 18px;
		font-size: 13px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	th,
	td {
		text-align: left;
		padding: 5px 8px;
		border-bottom: 1px solid var(--line);
	}
	th {
		color: var(--ink-dim);
		font-weight: 500;
	}
	@media (max-width: 640px) {
		.root {
			padding: 16px var(--gutter) 48px;
		}
		.row {
			grid-template-columns: minmax(90px, 2fr) 2fr 32px;
		}
	}
</style>
