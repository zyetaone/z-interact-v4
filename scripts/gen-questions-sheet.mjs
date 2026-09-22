#!/usr/bin/env node
/**
 * Builds docs/questions.pdf — the questions and nothing else.
 *
 * The question book (`gen-question-book.mjs`) is the illustrated one: every
 * option with its generated picture, every lens with its source and era
 * default, 3 MB and a page per question. It is the right document for
 * deciding what the app asks.
 *
 * THIS is the other document — the one you read aloud, hold at the desk, or
 * send to someone who needs to know what a table is asked and nothing more.
 * No pictures, no blurbs, no sources, no ids, no layer names. Questions,
 * their options, and which fields are optional.
 *
 *   node scripts/gen-questions-sheet.mjs [--out=docs/questions.pdf]
 *
 * Same source of truth as every other generated artefact here: it reads
 * questions.ts and futures.ts, so re-running it IS the update. Same
 * chromium-through-playwright print as the book, for the same reason — no
 * PDF library added for one sheet.
 */
import { register } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
register('./ts-ext-loader.mjs', import.meta.url);
const ROOT = join(__dirname, '..');

const { FUTURES, LENS_STEM } = await import('../src/lib/game/futures.ts');
const { QUESTIONS, WILDCARD, TABLE_COUNT } = await import('../src/lib/game/questions.ts');

// `--out=path`, not `--out path` — the book's own note: a spaced value is
// dropped silently and the default is written, which looks exactly like a
// regenerated file that did not change.
let OUT = join(ROOT, 'docs', 'questions.pdf');
for (const a of process.argv.slice(2)) {
	if (a.startsWith('--out=')) OUT = join(ROOT, a.slice(6));
	else if (a.startsWith('--')) {
		console.error(`${a} needs to be written ${a}=<value>`);
		process.exit(1);
	}
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/**
 * An open option is the table writing its own answer, so it prints as a
 * ruled line rather than a bullet — on a sheet meant to be read aloud, a
 * label with no picture beside it is otherwise indistinguishable from the
 * four that are tapped.
 */
function optionRow(o) {
	if (o.open) return `<li class="own"><b>${esc(o.label)}</b><span class="rule"></span></li>`;
	return `<li>${esc(o.label)}</li>`;
}

const questionBlocks = QUESTIONS.map((q, i) => `
	<section class="q">
		<h2><span class="n">${i + 2}</span>${esc(q.prompt)}</h2>
		<ul>${q.options.map(optionRow).join('')}</ul>
		${q.push ? `<p class="then"><b>Then</b> ${esc(q.push)} <em>optional</em></p>` : ''}
	</section>`).join('');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>The questions</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
	:root { --ink: #10192a; --muted: #5b6579; --gold: #9c7433; --line: #d9d5cc; }
	* { box-sizing: border-box; }
	body { margin: 0; font-family: "DM Sans", system-ui, sans-serif; color: var(--ink); font-size: 11pt; line-height: 1.45; }
	h1, h2, .n { font-family: "Playfair Display", Georgia, serif; }
	h1 { font-size: 24pt; margin: 0 0 2pt; }
	.sub { margin: 0 0 16pt; color: var(--muted); font-size: 9.5pt; }
	.q { page-break-inside: avoid; margin-bottom: 15pt; }
	h2 { font-size: 13pt; margin: 0 0 5pt; line-height: 1.3; display: flex; gap: 8pt; align-items: baseline; }
	/* The number is the screen's position on the phone: the lens is 1. */
	.n { color: var(--gold); font-size: 10pt; min-width: 14pt; }
	ul { margin: 0 0 0 22pt; padding: 0; }
	li { margin: 0 0 2pt; }
	/* The table writes its own: a line to write on, not a bullet to pick. */
	li.own { list-style: none; margin-left: -22pt; }
	li.own b { font-weight: 500; }
	.rule { display: block; height: 8mm; border-bottom: 0.5pt solid var(--line); margin-top: 1pt; }
	.then { margin: 5pt 0 0 22pt; color: var(--muted); font-size: 10pt; }
	.then b { color: var(--gold); text-transform: uppercase; letter-spacing: .08em; font-size: 8pt; margin-right: 4pt; }
	.then em { font-style: normal; font-size: 8pt; border: 0.5pt solid var(--line); border-radius: 8pt; padding: 0 5pt; margin-left: 4pt; }
	.skip { color: var(--muted); font-size: 10pt; margin: 3pt 0 0 22pt; }
	footer { margin-top: 10pt; padding-top: 6pt; border-top: 0.5pt solid var(--line); color: var(--muted); font-size: 8pt; }
</style></head>
<body>
	<h1>The questions</h1>
	<p class="sub">${QUESTIONS.length + 2} screens · ${TABLE_COUNT} tables · ${new Date().toISOString().slice(0, 10)}</p>

	<section class="q">
		<h2><span class="n">1</span>${esc(LENS_STEM)}</h2>
		<ul>${FUTURES.map((f) => `<li>${esc(f.name)}</li>`).join('')}</ul>
		<p class="skip">or — No future fits us, skip</p>
	</section>

	${questionBlocks}

	<section class="q">
		<h2><span class="n">${QUESTIONS.length + 2}</span>${esc(WILDCARD.prompt)}</h2>
		<ul><li class="own"><b>Anything at all — it is drawn word for word</b><span class="rule"></span></li></ul>
	</section>

	<footer>Generated from questions.ts and futures.ts by scripts/gen-questions-sheet.mjs. Re-run it after any change to either.</footer>
</body></html>`;

const htmlPath = join(ROOT, 'docs', 'questions.html');
await mkdir(dirname(htmlPath), { recursive: true });
await writeFile(htmlPath, html, 'utf8');

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
await page.pdf({ path: OUT, format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '14mm', left: '16mm', right: '16mm' } });
await browser.close();

const typed = QUESTIONS.filter((q) => q.push).length + QUESTIONS.flatMap((q) => q.options).filter((o) => o.open).length + 1;
console.log(`questions sheet: ${QUESTIONS.length + 2} screens, ${typed} places a table types -> ${OUT}`);
