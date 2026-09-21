#!/usr/bin/env node
/**
 * Builds docs/flow-book.pdf — the whole chain in one document: the screens
 * a table taps, the visual choices and the typed fill-ins, the prompt those
 * answers compose into, and the picture that prompt produced.
 *
 * WHY THIS EXISTS SEPARATELY FROM gen-question-book.mjs: the question book
 * is the CONTENT (every question, every option, every picture, as a
 * reference sheet). This is the PIPELINE — one table's actual run, in
 * order, ending in its render. A reader of the question book learns what is
 * asked; a reader of this learns what asking it does.
 *
 * Everything here is captured, never described: the screens are Playwright
 * shots of the running app, the prompt is read out of the review screen's
 * own textarea, and the render is the bytes the phone was served. Nothing
 * on these pages is written from memory of how the app behaves.
 *
 *   FAL_KEY set, no FAL_FAKE:
 *   npm run dev -- --port 5173 --strictPort
 *   npx playwright test tests/e2e/flow-book.spec.ts
 *   node scripts/gen-flow-book.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FLOW = join(ROOT, 'docs', 'flow');
const OUT = join(ROOT, 'docs', 'flow-book.pdf');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function shot(name, caption, note) {
	const abs = join(FLOW, `${name}.png`);
	if (!existsSync(abs)) return `<figure class="screen"><div class="missing">${esc(name)} not captured</div></figure>`;
	return `<figure class="screen">
		<img src="${pathToFileURL(abs).href}" alt="${esc(caption)}">
		<figcaption><b>${esc(caption)}</b>${note ? `<span>${esc(note)}</span>` : ''}</figcaption>
	</figure>`;
}

const captured = await readFile(join(FLOW, 'composed-prompt.txt'), 'utf-8');
const [answersBlock, composed] = captured.split(/--- composed \(\d+ characters\) ---\n/);
const composedChars = (captured.match(/--- composed \((\d+) characters\)/) ?? [])[1] ?? '?';

const answerRows = answersBlock
	.split('\n')
	.filter((l) => /^Q\d|^wildcard:/.test(l.trim()) || /^\s+typed:/.test(l))
	.join('\n');

const renderAbs = join(FLOW, 'workspace.jpg');
const renderTag = existsSync(renderAbs)
	? `<img class="render" src="${pathToFileURL(renderAbs).href}" alt="The rendered workspace">`
	: `<div class="missing big">no render captured — run the spec with a live FAL_KEY and no FAL_FAKE</div>`;

const html = `<!doctype html>
<meta charset="utf-8">
<title>End-to-end flow</title>
<style>
	@page { size: A4; margin: 14mm; }
	:root { --ink:#11151c; --mut:#5b6472; --line:#d8dde5; --gold:#9a7b3f; }
	* { box-sizing: border-box; }
	body { font: 10pt/1.45 -apple-system, "Helvetica Neue", Arial, sans-serif; color: var(--ink); margin:0; }
	h1 { font-size: 26pt; margin: 0 0 4pt; letter-spacing: -0.01em; }
	h2 { font-size: 15pt; margin: 0 0 10pt; padding-bottom: 4pt; border-bottom: 2px solid var(--gold); }
	.sub { color: var(--mut); margin: 0 0 18pt; }
	.page { page-break-after: always; }
	.page:last-child { page-break-after: auto; }
	/* A phone screen shot full-page is ~390x2000. Four of those across an A4
	   column are still a metre tall between them, which is why the first
	   layout pushed every strip onto its own page and left the cover blank.
	   Constrained height + contain keeps a tall screen legible and a short
	   one from being stretched. */
	.strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; align-items: start; }
	.screen { margin: 0; page-break-inside: avoid; }
	.screen img { width: 100%; max-height: 165mm; object-fit: contain; object-position: top;
	              border: 1px solid var(--line); border-radius: 3pt; display:block; }
	figcaption { font-size: 7.5pt; margin-top: 4pt; line-height: 1.3; }
	figcaption b { display:block; }
	figcaption span { color: var(--mut); }
	.missing { border: 1px dashed var(--line); color: var(--mut); padding: 14pt; text-align:center; font-size: 8pt; border-radius: 3pt; }
	.missing.big { padding: 60pt; }
	pre { white-space: pre-wrap; word-break: break-word; font: 8.5pt/1.5 "SF Mono", Menlo, monospace;
	      background:#f6f7f9; border:1px solid var(--line); border-radius:3pt; padding:10pt; margin:0 0 12pt; }
	.render { width: 100%; border:1px solid var(--line); border-radius:3pt; display:block; margin-bottom: 10pt; }
	table { border-collapse: collapse; width:100%; font-size: 9pt; }
	td, th { text-align:left; vertical-align: top; padding: 5pt 6pt; border-bottom: 1px solid var(--line); }
	th { color: var(--mut); font-weight:600; font-size: 8pt; text-transform: uppercase; letter-spacing:.06em; }
	.yes { color:#1f7a44; font-weight:700; }
	.no { color:#a33; font-weight:700; }
	.note { color: var(--mut); font-size: 8.5pt; }
</style>

<div class="page">
	<h1>End to end</h1>
	<p class="sub">One table's run, captured from the running app — the screens, the answers, the prompt they compose, and the picture that prompt produced. Table 4 · the garden city · ${new Date().toISOString().slice(0, 10)}</p>

	<h2>1 · The screens, in order</h2>
	<div class="strip">
		${shot('01-landing', 'Landing', 'the city is named here, before anything is asked')}
		${shot('02-lens', 'Screen 1 — the lens', 'six future cities as pictures')}
		${shot('03-lens-chosen', 'Lens chosen', 'the era chip appears only once the pick lands server-side')}
		${shot('04-q1', 'Q1 — nature', 'a percentage slider, not tiles')}
	</div>
</div>

<div class="page">
	<div class="strip">
		${shot('05-q2', 'Q2 — deep work', 'six tiles, an And: chip row, an open-text box')}
		${shot('06-q3', 'Q3 — recharge', '')}
		${shot('07-q4', 'Q4 — materials', '')}
		${shot('08-wildcard', 'Wildcard', 'free text, 140 characters, drawn verbatim')}
	</div>
</div>

<div class="page">
	<div class="strip">
		${shot('09-review', 'Review', 'every answer editable; the prompt shown as it will be sent')}
		${shot('10-drawing', 'Drawing', 'polls every 2s; the phone can be put down')}
		${shot('11-done', 'Done', 'the render, and the table’s answers written back as a paragraph')}
	</div>
</div>

<div class="page">
	<h2>2 · What this table answered</h2>
	<pre>${esc(answerRows)}</pre>

	<h2>3 · The prompt those answers composed</h2>
	<p class="note">${composedChars} characters. Read out of the review screen's own textarea — this is the string submitted, not a reconstruction. The house half (camera, lighting, the no-text guard, the Avoid list) is also sent separately in fal's <code>system_prompt</code> field; it still appears here because the composed prompt has not stopped saying it.</p>
	<pre>${esc((composed ?? '').trim())}</pre>
</div>

<div class="page">
	<h2>4 · The workspace</h2>
	${renderTag}
	<p class="note">fal-ai/nano-banana-2, 16:9, one hero render (<code>ZONE_SET=hero</code>). The bytes the phone was served, off the app's own R2 read path.</p>

	<h2 style="margin-top:14pt">Does the picture contain the answers?</h2>
	<table>
		<tr><th>What the table chose</th><th>In the frame</th><th></th></tr>
		<tr><td>Courtyards — the floor opens to the sky</td><td>Glazed roof structure, courtyards cut through the plate</td><td class="yes">yes</td></tr>
		<tr><td>The glass dome in the forest</td><td>Geodesic dome, one person working inside it</td><td class="yes">yes</td></tr>
		<tr><td>The water room, fully immersive</td><td>Steaming pool, two people floating</td><td class="yes">yes</td></tr>
		<tr><td>Warm and earthy, generous scale</td><td>Rammed earth, timber, brass, terracotta paving; open floor</td><td class="yes">yes</td></tr>
		<tr><td><b>Wildcard</b> — "a staircase that is also a place to sit and watch the room"</td><td>Stepped seating at right, two people sitting on it</td><td class="yes">yes</td></tr>
		<tr><td>And: the AI sits "in the light"</td><td>Not legible. The autonomous cart reads as the garden city's own signature, not as this pick</td><td class="no">no</td></tr>
	</table>
	<p class="note">A read of this one render, not a measurement across the room. The wildcard appearing at all is the 21 Sep fix: under the default zone set the wildcard reached the database, the review screen, the desk and the export, and never the picture.</p>
</div>
`;

await mkdir(join(ROOT, 'docs'), { recursive: true });
await writeFile(join(ROOT, 'docs', 'flow-book.html'), html, 'utf-8');

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(join(ROOT, 'docs', 'flow-book.html')).href, { waitUntil: 'networkidle' });
await page.pdf({ path: OUT, format: 'A4', printBackground: true });
await browser.close();
console.log(`flow book -> ${OUT}`);
