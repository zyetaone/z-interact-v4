<script lang="ts">
	/**
	 * SAVE THE SESSION'S PHOTOGRAPHS.
	 *
	 * After the event somebody has to get twenty pictures off Cloudflare and
	 * into a folder. Until now the only paths were the desk's Export (which
	 * gives rows, not images) and `wrangler r2 object get` one key at a time.
	 *
	 * ponytail: no zip. Zipping in a Worker means a dependency and a second
	 * failure mode (a half-written archive that looks fine until it is
	 * opened) for twenty files. "Save all" clicks the same per-file links the
	 * page already shows, spaced out so the browser does not drop them.
	 * Add a zip when this is hundreds of files or when someone is doing it
	 * over a hotel connection.
	 */
	import { roomPhotos } from './photos.remote';
	import { page } from '$app/state';

	const token = $derived(page.url.searchParams.get('token') ?? '');
	const res = $derived(await roomPhotos({ token }));

	let saving = $state(false);
	let saved = $state(0);

	async function saveAll(photos: { url: string; filename: string }[]) {
		saving = true;
		saved = 0;
		for (const p of photos) {
			const a = document.createElement('a');
			a.href = p.url;
			a.download = p.filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			saved++;
			// Browsers throttle or silently drop a burst of programmatic
			// downloads. 300ms is slow enough to survive that and still
			// finishes twenty files in six seconds.
			await new Promise((r) => setTimeout(r, 300));
		}
		saving = false;
	}
</script>

<svelte:head><title>Photographs</title></svelte:head>

<main>
	{#if !res.ok}
		<h1>Photographs</h1>
		<p class="bad">{res.reason}</p>
		<p class="note">Add <code>?token=…</code> to the URL.</p>
	{:else}
		<header>
			<div>
				<h1>Photographs</h1>
				<p class="note">
					{res.photos.length}
					{res.photos.length === 1 ? 'picture' : 'pictures'} from {res.tables} tables · {res.event}
				</p>
			</div>
			{#if res.photos.length}
				<button class="btn" disabled={saving} onclick={() => saveAll(res.photos)}>
					{saving ? `Saving ${saved} of ${res.photos.length}…` : 'Save all'}
				</button>
			{/if}
		</header>

		{#if !res.photos.length}
			<p class="note">Nothing has been drawn yet.</p>
		{:else}
			<ul class="grid">
				{#each res.photos as photo (photo.id)}
					<li>
						<a href={photo.url} download={photo.filename}>
							<img src={photo.url} alt="Table {photo.table}" loading="lazy" />
							<span>Table {photo.table}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
		<p class="note">
			Every render the event stored, including ones a table later redrew —
			a reset hides a picture from the room, it does not mean it never
			happened.
		</p>
	{/if}
</main>

<style>
	main {
		max-width: 1100px;
		margin: 0 auto;
		padding: 24px 16px 60px;
	}
	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}
	h1 {
		margin: 0 0 4px;
	}
	.note {
		color: var(--ink-faint);
		font-size: 14px;
		margin: 0;
	}
	.bad {
		color: #d66;
	}
	.grid {
		list-style: none;
		margin: 20px 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 12px;
	}
	.grid a {
		display: block;
		text-decoration: none;
		color: inherit;
	}
	.grid img {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		border-radius: 6px;
		display: block;
		background: rgba(255, 255, 255, 0.04);
	}
	.grid span {
		display: block;
		font-size: 13px;
		margin-top: 5px;
		color: var(--ink-faint);
	}
</style>
