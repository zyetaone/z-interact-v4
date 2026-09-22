<script lang="ts">
	let { children } = $props();
</script>

<svelte:head>
	<!--
		`static/favicon.svg`, not a `$lib/assets` import. The bundled import gave
		the icon a hashed filename, so a browser's own default probe for
		`/favicon.svg` (and every tool that guesses that path) 404'd — and what
		it was serving under the hash was still the Svelte scaffold logo, on a
		client's projector and on twenty phones. A static path is one URL that
		does not move between builds.

		No `apple-touch-icon`: iOS only reads one when a page is added to the
		home screen, which nobody does with a QR code they scan once.
	-->
	<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
</svelte:head>

{@render children()}
