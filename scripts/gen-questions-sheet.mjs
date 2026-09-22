#!/usr/bin/env node
/**
 * Builds docs/questions.pdf — the printed worksheet. Four pages, laid out
 * to the question owner's 22 Sep comments:
 *
 *   p1  Question 1 (the lens): heading FIRST, then the four visuals.
 *   p2  Questions 2 and 3, each with a medium open box under its last line.
 *   p3  Questions 4 and 5.
 *   p4  The wildcard: a tall open paragraph, stopping a wide margin from
 *       the bottom of the page.
 *
 * "Remove the word Then" — the push line is no longer labelled; it reads as
 * the last line of its question and the box sits under it.
 *
 * The other document is `gen-question-book.mjs`, which is the illustrated
 * reference: every option with its picture, every lens with its source and
 * era default. That one is for deciding what the app asks. THIS one is for
 * the table to write on.
 *
 *   node scripts/gen-questions-sheet.mjs [--out=docs/questions.pdf]
 *
 * `--handover` also copies the four lens visuals into docs/handover/ at
 * their full size, which is what a designer needs and a PDF will not give
 * them.
 *
 * Same source of truth as every other artefact in docs/: it reads
 * questions.ts and futures.ts, so re-running it IS the update.
 *
 * ponytail: prints through the playwright chromium already in
 * devDependencies rather than adding a PDF library, exactly as the book
 * does. Box heights are millimetres in one place (`BOX`) because "medium,
 * same as question 2" is a real instruction that will be revised by eye.
 */
import { register } from 'node:module';
import { writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
register('./ts-ext-loader.mjs', import.meta.url);
const ROOT = join(__dirname, '..');

const { FUTURES, LENS_STEM } = await import('../src/lib/game/futures.ts');
const { QUESTIONS, WILDCARD, TABLE_COUNT } = await import('../src/lib/game/questions.ts');

let OUT = join(ROOT, 'docs', 'questions.pdf');
let HANDOVER = false;
for (const a of process.argv.slice(2)) {
	if (a.startsWith('--out=')) OUT = join(ROOT, a.slice(6));
	else if (a === '--handover') HANDOVER = true;
	else if (a.startsWith('--')) {
		console.error(`${a} needs to be written ${a}=<value>`);
		process.exit(1);
	}
}

/**
 * The writing boxes, in millimetres and in ONE place.
 *
 * `medium` is question 2's, which the owner named as the reference for
 * every other box on pages 2 and 3 ("Medium sized – same as question 2").
 * `tall` is the wildcard's, and `bottomMargin` is the "wide margin from
 * bottom" it must stop short of — the page is 297mm with 16/14mm print
 * margins, so the tall box plus its heading plus this margin is what fills
 * the last page.
 */
const BOX = { medium: 26, tall: 200, bottomMargin: 6 };

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/** A ruled area to write in. Ruled, not blank: a blank box gets one line written across the middle of it. */
const box = (mm, cls = '') => `<div class="box ${cls}" style="height:${mm}mm"></div>`;

function lensCard(f) {
	const rel = `../static/visuals/lens/${f.key}.jpg`;
	const abs = join(ROOT, 'static', 'visuals', 'lens', `${f.key}.jpg`);
	// HEADING FIRST, THEN VISUAL (the owner's note). A caption under a
	// picture makes the reader look before they know what they are looking
	// at, which on a lens card is the whole decision.
	const art = existsSync(abs)
		? `<img src="${rel}" alt="">`
		: `<div class="missing">no picture on disk for ${esc(f.key)}</div>`;
	return `<figure class="lens"><figcaption>${esc(f.name)}</figcaption>${art}</figure>`;
}

/**
 * One question. `write` gives it a box under its last line — which is the
 * push line where there is one, and the options where there is not.
 */
function question(q, n, write) {
	const options = q.options
		.map((o) =>
			o.open
				? `<li class="own">${esc(o.label)}</li>`
				: `<li>${esc(o.label)}</li>`
		)
		.join('');
	return `
	<section class="q">
		<h2><span class="n">${n}</span>${esc(q.prompt)}</h2>
		<ul>${options}</ul>
		${q.push ? `<p class="last">${esc(q.push)}</p>` : ''}
		${write ? box(BOX.medium) : ''}
	</section>`;
}

// The owner's pagination, by POSITION not by id: page 2 takes the first two
// questions, page 3 the next two. If the set changes length this still
// paginates rather than throwing away a question — the count is asserted
// below so a change that breaks the layout is loud.
if (QUESTIONS.length !== 4) {
	console.error(`this layout is four questions across two pages; QUESTIONS has ${QUESTIONS.length}. Adjust the pages before shipping.`);
	process.exit(1);
}
const [q2, q3, q4, q5] = QUESTIONS;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>The questions</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
	:root { --ink: #10192a; --muted: #5b6579; --gold: #9c7433; --line: #c9c4ba; }
	* { box-sizing: border-box; }
	body { margin: 0; font-family: "DM Sans", system-ui, sans-serif; color: var(--ink); font-size: 11pt; line-height: 1.45; }
	h1, h2, .n { font-family: "Playfair Display", Georgia, serif; }
	h1 { font-size: 22pt; margin: 0 0 1pt; }
	.sub { margin: 0 0 14pt; color: var(--muted); font-size: 9pt; }
	.page { page-break-after: always; }
	.page:last-of-type { page-break-after: auto; }

	h2 { font-size: 14pt; margin: 0 0 6pt; line-height: 1.3; display: flex; gap: 9pt; align-items: baseline; }
	.n { color: var(--gold); font-size: 11pt; min-width: 15pt; }
	.q { page-break-inside: avoid; margin-bottom: 16pt; }
	ul { margin: 0 0 0 24pt; padding: 0; }
	li { margin: 0 0 3pt; }
	/* An open option is the table writing its own, so it reads as a prompt
	   to write rather than a thing to tick. */
	li.own { list-style: none; margin-left: 0; color: var(--muted); font-style: italic; }
	/* THE PUSH LINE, UNLABELLED. It used to carry a gold "THEN"; the owner
	   struck it, so it reads as the question's last line and the box under
	   it is the answer to it. */
	.last { margin: 7pt 0 0 24pt; }
	.box { margin: 5pt 0 0 24pt; border: 0.5pt solid var(--line); border-radius: 2pt;
		background: repeating-linear-gradient(transparent, transparent 24pt, var(--line) 24pt, var(--line) 24.4pt); }

	/* Page 1: the four lenses, two across, heading above each picture. */
	.lenses { display: grid; grid-template-columns: 1fr 1fr; gap: 11pt 13pt; margin-left: 24pt; }
	.lens { margin: 0; page-break-inside: avoid; }
	.lens figcaption { font-family: "Playfair Display", Georgia, serif; font-size: 12pt; margin: 0 0 4pt; }
	.lens img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 3pt; display: block; }
	.missing { width: 100%; aspect-ratio: 4/3; border: 1pt dashed var(--line); border-radius: 3pt;
		display: flex; align-items: center; justify-content: center; font-size: 8pt; color: var(--muted); text-align: center; }
	.skip { margin: 10pt 0 0 24pt; color: var(--muted); }

	/* Page 4: the tall box stops BOX.bottomMargin from the page edge. */
	.wild .box { margin-top: 7pt; }
	footer { margin-top: ${BOX.bottomMargin}mm; color: var(--muted); font-size: 7.5pt; }
</style></head>
<body>
	<div class="page">
		<h1>The questions</h1>
		<p class="sub">${QUESTIONS.length + 2} screens · ${TABLE_COUNT} tables · ${new Date().toISOString().slice(0, 10)}</p>
		<section class="q">
			<h2><span class="n">1</span>${esc(LENS_STEM)}</h2>
			<div class="lenses">${FUTURES.map(lensCard).join('')}</div>
			<p class="skip">or — No future fits us, skip</p>
		</section>
	</div>

	<div class="page">
		${question(q2, 2, true)}
		${question(q3, 3, true)}
	</div>

	<div class="page">
		${question(q4, 4, false)}
		${question(q5, 5, false)}
	</div>

	<div class="page wild">
		<section class="q">
			<h2><span class="n">6</span>${esc(WILDCARD.prompt)}</h2>
			${box(BOX.tall)}
		</section>
		<footer>Generated from questions.ts and futures.ts by scripts/gen-questions-sheet.mjs. Re-run it after any change to either.</footer>
	</div>
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

if (HANDOVER) {
	const dir = join(ROOT, 'docs', 'handover', 'lenses');
	await mkdir(dir, { recursive: true });
	for (const f of FUTURES) {
		const from = join(ROOT, 'static', 'visuals', 'lens', `${f.key}.jpg`);
		if (!existsSync(from)) continue;
		// Named by the lens as the QUESTION prints it, not by its internal
		// key: whoever lays this out is matching pictures to names on a page.
		await copyFile(from, join(dir, `${f.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.jpg`));
	}
	console.log(`handover: ${FUTURES.length} lens visuals -> docs/handover/lenses/`);
}

console.log(`questions sheet: 4 pages, ${QUESTIONS.length + 2} screens -> ${OUT}`);
