<script lang="ts">
	/**
	 * PROTOTYPE — "step inside the world". Not part of the event flow.
	 *
	 * `/lab/world` exists to answer ONE question before any of this is built
	 * for real: does standing inside a Gaussian-splat world actually work on
	 * the hardware in the room — a phone someone is holding, and the
	 * projector — or only on a laptop?
	 *
	 * WHY THIS IS NOT AN IFRAME. The obvious plan was to embed World Labs'
	 * own hosted viewer (`world_marble_url`, which the World API returns on
	 * every finished world). Measured 22 Sep, marble.worldlabs.ai serves
	 * `X-Frame-Options: DENY` and `content-security-policy: frame-ancestors
	 * 'none'`. It cannot be framed, by us or by anyone. So the supported
	 * route is their own renderer, spark — which their docs recommend and
	 * which their own website is built on.
	 *
	 * WHAT IS REAL HERE: the renderer, the splat and the interaction. This
	 * page loads a genuine Gaussian-splat world over the network and lets
	 * you walk it. WHAT IS NOT REAL: the world is one of spark's public
	 * sample assets, NOT a world generated from a table's render — that
	 * needs a World Labs API key, which this deploy does not have. The
	 * pipeline is `render -> worlds:generate -> poll -> .spz`, and the only
	 * missing piece is the key.
	 *
	 * three and spark are real dependencies, dynamically imported inside the
	 * click handler so Vite code-splits them onto THIS route: the phone
	 * flow, the desk and the projector never download them.
	 *
	 * They are not loaded from CDN, which was the first attempt. Spark's ESM
	 * build imports `three` as a BARE specifier, so a browser needs an
	 * import map to resolve it — and an import map has to be parsed before
	 * the first module script on the page, which in SvelteKit is its own
	 * hydration bundle. The page loaded, the click failed with "Failed to
	 * resolve module specifier \"three\"", and no amount of ordering inside
	 * the component could fix it. The bundler resolving the specifier is the
	 * supported answer.
	 */
	import '../../../app.css';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	const WORLDS = [
		{ key: 'valley', label: 'A valley', mb: 6.4, url: 'https://sparkjs.dev/assets/splats/valley.spz' },
		{ key: 'butterfly', label: 'A butterfly', mb: 3.8, url: 'https://sparkjs.dev/assets/splats/butterfly.spz' },
		{ key: 'penguin', label: 'A penguin', mb: 2.4, url: 'https://sparkjs.dev/assets/splats/penguin.spz' }
	];

	let canvas = $state<HTMLCanvasElement | null>(null);
	let status = $state('idle');
	let fps = $state(0);
	let loadMs = $state(0);
	let chosen = $state(WORLDS[0]);
	let teardown: (() => void) | null = null;

	/** Everything the room needs to judge this, measured rather than claimed. */
	const device = $derived.by(() => {
		// `browser`, not `typeof navigator === 'undefined'`. Node 21+ ships a
		// global `navigator`, so that guard passes ON THE SERVER and the next
		// line reaches for `window` and throws — this page 500'd in SSR for
		// exactly that reason. The old shibboleth stopped working when the
		// runtime grew the object it was testing for.
		if (!browser) return '';
		const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
		return [
			`${window.innerWidth}x${window.innerHeight}`,
			`dpr ${window.devicePixelRatio}`,
			mem ? `${mem} GB` : null,
			navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} cores` : null
		]
			.filter(Boolean)
			.join(' · ');
	});

	async function enter(world: (typeof WORLDS)[number]) {
		teardown?.();
		teardown = null;
		chosen = world;
		status = `loading ${world.mb} MB…`;
		fps = 0;
		loadMs = 0;
		const started = performance.now();

		try {
			const THREE = await import('three');
			const { SparkRenderer, SplatMesh, SparkControls } = await import('@sparkjsdev/spark');
			if (!canvas) return;

			const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
			renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

			const scene = new THREE.Scene();
			const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 1000);

			/*
			 * `SparkRenderer` IS the thing that draws splats, and it has to be
			 * in the scene. Without it three renders the scene happily and the
			 * canvas is black — which is exactly what happened first time:
			 * status went to "inside", time-to-first-frame read 16.4s (the
			 * 6.4 MB really had downloaded), and there was nothing to see. A
			 * SplatMesh on its own is data with no renderer behind it.
			 */
			const spark = new SparkRenderer({ renderer });
			scene.add(spark);

			const splat = new SplatMesh({ url: world.url });
			// Spark's worlds are authored Y-down relative to three's convention.
			splat.quaternion.set(1, 0, 0, 0);
			scene.add(splat);

			// Spark's own controls rather than a hand-rolled orbit: drag to
			// look, WASD / arrows to walk, touch drag on a phone. Walking is
			// the whole question this page exists to answer, and an orbit
			// camera cannot answer it — you would be looking AT the world
			// rather than standing in it.
			const controls = new SparkControls({ canvas });

			const resize = () => {
				const w = canvas!.clientWidth;
				const h = canvas!.clientHeight;
				renderer.setSize(w, h, false);
				camera.aspect = w / h;
				camera.updateProjectionMatrix();
			};
			resize();
			window.addEventListener('resize', resize);

			let raf = 0;
			let frames = 0;
			let since = performance.now();
			let settled = false;

			const loop = () => {
				raf = requestAnimationFrame(loop);
				controls.update(camera);
				renderer.render(scene, camera);

				frames++;
				const now = performance.now();
				if (now - since >= 500) {
					fps = Math.round((frames * 1000) / (now - since));
					frames = 0;
					since = now;
					if (!settled) {
						settled = true;
						loadMs = Math.round(now - started);
						status = 'inside';
					}
				}
			};
			loop();

			teardown = () => {
				cancelAnimationFrame(raf);
				window.removeEventListener('resize', resize);
				splat.dispose?.();
				renderer.dispose();
			};
		} catch (e) {
			status = `failed: ${e instanceof Error ? e.message : String(e)}`;
		}
	}

	onMount(() => () => teardown?.());
</script>

<svelte:head><title>Lab — step inside</title></svelte:head>

<main class="lab">
	<p class="tag">Prototype · not part of the event flow</p>
	<h1>Step inside the world</h1>
	<p class="lede">
		A real Gaussian-splat world, rendered here by <b>spark</b> — World Labs' own renderer. Drag to look, scroll or
		pinch to move. <b>Try this on your phone</b>, which is the question that matters.
	</p>

	<div class="pick">
		{#each WORLDS as w (w.key)}
			<button class="btn ghost" class:on={chosen.key === w.key} onclick={() => enter(w)}>
				{w.label} <span class="mb">{w.mb} MB</span>
			</button>
		{/each}
	</div>

	<div class="stage">
		<canvas bind:this={canvas}></canvas>
		{#if status !== 'inside'}
			<p class="overlay">{status === 'idle' ? 'Pick a world above' : status}</p>
		{/if}
	</div>

	<dl class="readout">
		<div><dt>state</dt><dd>{status}</dd></div>
		<div><dt>fps</dt><dd>{fps || '—'}</dd></div>
		<div><dt>to first frame</dt><dd>{loadMs ? `${(loadMs / 1000).toFixed(1)}s` : '—'}</dd></div>
		<div><dt>this device</dt><dd>{device}</dd></div>
	</dl>

	<section class="truth">
		<h2>What is and isn't real on this page</h2>
		<p>
			<b>Real:</b> the renderer, the splat, the interaction, and the numbers above. This is the same library World
			Labs' own site uses, loading a genuine world over the network.
		</p>
		<p>
			<b>Not real yet:</b> the world is one of spark's public samples, not one generated from a table's render. That
			needs a World Labs API key, which this deploy does not have. The chain is
			<code>render → worlds:generate → poll → .spz</code>, and it is the same submit-and-poll shape as fal, so the
			ticker already models it.
		</p>
		<p>
			<b>Why not an iframe:</b> World Labs' hosted viewer returns <code>X-Frame-Options: DENY</code> and
			<code>frame-ancestors 'none'</code> (measured 22 Sep), so it cannot be embedded by anyone. Rendering the splat
			ourselves is the supported path, and their docs recommend it.
		</p>
	</section>
</main>

<style>
	.lab {
		max-width: 900px;
		margin: 0 auto;
		padding: 24px 16px 64px;
		color: var(--ink);
	}
	.tag {
		color: var(--gold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-size: 11px;
		margin: 0 0 6px;
	}
	h1 {
		font-family: var(--display);
		margin: 0 0 8px;
	}
	.lede {
		color: var(--ink-dim);
		margin: 0 0 16px;
		max-width: 62ch;
	}
	.pick {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 12px;
	}
	.pick .on {
		border-color: var(--gold);
		color: var(--gold);
	}
	.mb {
		opacity: 0.55;
		font-size: 12px;
	}
	.stage {
		position: relative;
		aspect-ratio: 16 / 10;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--ground-deep);
	}
	canvas {
		width: 100%;
		height: 100%;
		display: block;
		touch-action: none;
	}
	.overlay {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: var(--ink-faint);
		margin: 0;
		text-align: center;
		padding: 16px;
	}
	.readout {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 10px;
		margin: 14px 0 0;
	}
	.readout div {
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 8px 10px;
	}
	dt {
		color: var(--ink-faint);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	dd {
		margin: 2px 0 0;
		font-variant-numeric: tabular-nums;
	}
	.truth {
		margin-top: 28px;
		border-top: 1px solid var(--line);
		padding-top: 16px;
	}
	.truth h2 {
		font-size: 15px;
		margin: 0 0 8px;
	}
	.truth p {
		color: var(--ink-dim);
		max-width: 68ch;
		margin: 0 0 8px;
	}
	code {
		background: var(--card);
		padding: 1px 5px;
		border-radius: 5px;
	}
</style>
