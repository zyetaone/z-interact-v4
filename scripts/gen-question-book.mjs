#!/usr/bin/env node
/**
 * Builds docs/question-book.pdf — every question, every option, every
 * picture, in the order a table is asked them.
 *
 * WHY A SCRIPT AND NOT A ONE-OFF: the question set and the art both change
 * (V4 moved from nine questions to eleven and then, on 21 Sep, was cut
 * back to five, and the whole option set was regenerated the same day). A PDF produced by hand is out of date the next
 * time either moves. This reads `questions.ts`, `futures.ts` and whatever is
 * actually on disk in `static/visuals/`, so re-running it is the whole
 * update. It is the same shape as `gen-contact-sheet.mjs`, which is the
 * screen-sized version of this sheet.
 *
 *   node scripts/gen-question-book.mjs [--out docs/question-book.pdf]
 *
 * ponytail: prints through the Playwright chromium that is already a
 * devDependency, rather than adding a PDF library. A missing picture prints
 * as a labelled dashed box, never a placeholder image — a partial art run
 * should read as partial.
 */
import { register } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
register('./ts-ext-loader.mjs', import.meta.url);
const ROOT = join(__dirname, '..');

const { FUTURES, LENS_STEM } = await import('../src/lib/game/futures.ts');
const { QUESTIONS, WILDCARD, TABLE_COUNT } = await import('../src/lib/game/questions.ts');

// `--out=path`, not `--out path`: the split-on-'=' form silently dropped a
// spaced value and wrote to the default, which looks exactly like a
// regenerated file that did not change.
const argv = process.argv.slice(2);
for (const a of argv) {
	if (a.startsWith('--') && !a.includes('=')) {
		console.error(`${a} needs to be written ${a}=<value>`);
		process.exit(1);
	}
}
const args = new Map(argv.map((a) => a.replace(/^--/, '').split('=')));
const OUT = resolve(ROOT, args.get('out') ?? 'docs/question-book.pdf');

/** `SelectKind` is a tagged union, not a string — printing it raw gave "pick [object Object]". */
function selectLabel(select) {
	if (select.kind === 'one') return 'pick one';
	if (select.kind === 'pick') return `pick ${select.n}`;
	const { min, max } = select;
	if (min && max) return `pick ${min}\u2013${max}`;
	if (max) return `pick up to ${max}`;
	if (min) return `pick ${min} or more`;
	return 'pick any';
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `file://` absolute, so the PDF renderer resolves pictures with no server. */
function img(relPath, alt, cls = '') {
	const abs = join(ROOT, 'static', relPath);
	if (!existsSync(abs)) return `<div class="missing">no picture yet<br><code>${esc(relPath)}</code></div>`;
	return `<img class="${cls}" src="${pathToFileURL(abs).href}" alt="${esc(alt)}">`;
}

const lensCards = FUTURES.map(
	(f) => `
	<figure class="card">
		${img(`/visuals/lens/${f.key}.jpg`, f.name)}
		<figcaption>
			<b>${esc(f.name)}</b>
			<p>${esc(f.blurb)}</p>
			<p class="meta">${esc(f.provenance)} · era default: ${esc(f.eraDefault)}${f.eraLocked ? ' (locked)' : ''}</p>
		</figcaption>
	</figure>`
).join('');

/**
 * The typed field under a question's options — the 21 Sep note "similar to
 * KL, allow open text below", KL being generation 1, where every field was
 * free text. It used to print as a "Talk" line, which reads as something
 * said at the table and never typed. Since 22 Sep only q2 has one: q8's and
 * q5c's boxes were removed and q6r's became an open option, and `pushNotDrawn`
 * went with them — every surviving push reply IS drawn, so there is no longer
 * a second case to print.
 */
function openText(q) {
	if (!q.push || !q.pushCapturesReply) return '';
	return `<div class="open-text">
		<h3>Open text: ${esc(q.push)}</h3>
		<p class="meta">Optional \u2014 added to the prompt word for word.</p>
		<div class="field"></div>
	</div>`;
}

function optionCard(q, o) {
	return `
	<figure class="card">
		${img(`/visuals/opt/${q.id}-${o.key}.jpg`, o.label)}
		<figcaption>
			<b>${esc(o.label)}</b>
			<p class="meta">${esc(o.key)}</p>
		</figcaption>
	</figure>`;
}

/**
 * An `open` option is a WRITING SPACE, not a picture with nothing in it.
 * Rendered inside the grid it was a dashed "typed answer / no picture" tile
 * that made a five-option question read as three across and two, and made
 * the reader look for a missing image. It belongs with the other ruled box.
 */
function openOptionBox(q) {
	const open = q.options.filter((o) => o.open);
	if (open.length === 0) return '';
	return open
		.map(
			(o) => `<div class="open-text">
		<h3>Or: ${esc(o.label)}</h3>
		<p class="meta">Optional — ${esc(o.key)} · typed, and drawn word for word.</p>
		<div class="field"></div>
	</div>`
		)
		.join('');
}

/**
 * SIX ACROSS IN TWO ROWS, OR FOUR IN TWO ROWS — never three and a lone
 * fourth, which is the layout the 21 Sep note objected to on the recharge
 * page. Cutting a question to four options recreated exactly that on the
 * materials page, so the column count follows the option count instead of
 * being fixed at three.
 */
function gridColumns(pictured) {
	return pictured <= 4 ? 2 : 3;
}

const questionSections = QUESTIONS.map((q, i) => {
	const and = q.and
		? `<div class="and">
				<h3>And: ${esc(q.and.prompt)}</h3>
				<p class="meta">Optional — never blocks the way forward.</p>
				<ul class="chips">${q.and.options.map((o) => `<li>${esc(o.label)}</li>`).join('')}</ul>
			</div>`
		: '';
	return `
	<section class="question">
		<header>
			<span class="n">${i + 1} of ${QUESTIONS.length}</span>
			<h2>${q.diamond ? '<span class="diamond">&#9670;</span> ' : ''}${esc(q.prompt)}</h2>
			${q.lead ? `<p class="lead">${esc(q.lead)}</p>` : ''}
			${q.push && !q.pushCapturesReply ? `<p class="push"><b>Talk</b> ${esc(q.push)}</p>` : ''}
			<p class="meta">${esc(q.id)} · ${esc(selectLabel(q.select))} · feeds the <b>${esc(q.layer)}</b> layer${q.slider ? ` · answered on a ${q.slider[0]}\u2013${q.slider[q.slider.length - 1]}% slider` : ''}</p>
		</header>
		<div class="grid" style="grid-template-columns: repeat(${gridColumns(q.options.filter((o) => !o.open).length)}, 1fr)">${q.options
			.filter((o) => !o.open)
			.map((o) => optionCard(q, o))
			.join('')}</div>
		${openOptionBox(q)}
		${openText(q)}
		${and}
	</section>`;
}).join('');

const wildcardSection = `
	<section class="question">
		<header>
			<span class="n">last</span>
			<h2>${esc(WILDCARD.prompt)}</h2>
			<p class="meta">${esc(WILDCARD.id)} · typed, optional · added to the prompt word for word</p>
		</header>
	</section>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>The question book</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
	:root { --ink: #10192a; --muted: #5b6579; --gold: #9c7433; --line: #d9d5cc; }
	* { box-sizing: border-box; }
	body { margin: 0; font-family: "DM Sans", system-ui, sans-serif; color: var(--ink); font-size: 10pt; }
	h1, h2, h3, .n { font-family: "Playfair Display", Georgia, serif; }
	.cover { height: 247mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
	.cover h1 { font-size: 34pt; margin: 0 0 6pt; }
	.cover p { margin: 0 0 4pt; color: var(--muted); max-width: 120mm; }
	h2 { font-size: 15pt; margin: 0 0 4pt; line-height: 1.25; }
	h3 { font-size: 11pt; margin: 0 0 2pt; }
	.section-title { font-size: 20pt; margin: 0 0 8pt; border-bottom: 2px solid var(--gold); padding-bottom: 4pt; }
	.question { page-break-inside: avoid; page-break-before: always; }
	.question header { border-bottom: 1px solid var(--line); padding-bottom: 6pt; margin-bottom: 8pt; }
	.n { display: block; font-size: 9pt; letter-spacing: .12em; text-transform: uppercase; color: var(--gold); }
	.diamond { color: var(--gold); }
	.lead { margin: 2pt 0; color: var(--muted); }
	.push { margin: 4pt 0 2pt; }
	.push b { color: var(--gold); letter-spacing: .08em; text-transform: uppercase; font-size: 8pt; margin-right: 5pt; }
	.meta { margin: 2pt 0 0; font-size: 8pt; color: var(--muted); }
	.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7pt; }
	.card { margin: 0; page-break-inside: avoid; }
	.card img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 3pt; display: block; }
	.card figcaption { padding-top: 3pt; }
	.card b { font-size: 9pt; line-height: 1.3; display: block; }
	.card p { margin: 1pt 0 0; font-size: 8pt; color: var(--muted); line-height: 1.35; }
	.missing { width: 100%; aspect-ratio: 4/3; border: 1pt dashed var(--line); border-radius: 3pt;
		display: flex; flex-direction: column; align-items: center; justify-content: center;
		font-size: 8pt; color: var(--muted); text-align: center; }
	.and { margin-top: 8pt; padding: 6pt 8pt; border-left: 2pt solid var(--gold); background: #faf8f4; page-break-inside: avoid; }
	.open-text { margin-top: 8pt; padding: 6pt 8pt; border: 1pt solid var(--line); border-radius: 3pt; page-break-inside: avoid; }
	.open-text h3 { color: var(--gold); }
	/* A ruled box, so the printed sheet can actually be written in. */
	.open-text .field { margin-top: 5pt; height: 13mm; border-bottom: 0.5pt solid var(--line);
		background: repeating-linear-gradient(transparent, transparent 6mm, var(--line) 6mm, var(--line) 6.08mm); }
	.chips { list-style: none; margin: 4pt 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4pt; }
	.chips li { border: 1px solid var(--line); border-radius: 10pt; padding: 2pt 7pt; font-size: 8pt; }
	/* Three across keeps all six lenses on one page; two across spilled the last pair over. */
	.lenses { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8pt; page-break-inside: avoid; }
</style></head>
<body>
	<div class="cover">
		<h1>The question book</h1>
		<p>Every question a table is asked, every option it can choose, and the picture it sees — in the order they are asked.</p>
		<p>${QUESTIONS.length} questions, plus the lens and the wildcard \u2014 ${QUESTIONS.length + 2} screens on the phone · ${TABLE_COUNT} tables · generated ${new Date().toISOString().slice(0, 10)}</p>
		<p class="meta">Generated from questions.ts, futures.ts and the pictures on disk by scripts/gen-question-book.mjs. Re-run it after any change to either.</p>
	</div>

	<h1 class="section-title">First: ${esc(LENS_STEM)}</h1>
	<p class="meta">A worldview, not a character. It sets what surrounds the table: the building, the skyline, the light. One per table; a table may also skip it.</p>
	<div class="lenses">${lensCards}</div>

	${questionSections}
	${wildcardSection}
</body></html>`;

const htmlPath = join(ROOT, 'docs', 'question-book.html');
await mkdir(dirname(htmlPath), { recursive: true });
await writeFile(htmlPath, html, 'utf8');

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
await page.pdf({
	path: OUT,
	format: 'A4',
	printBackground: true,
	margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' }
});
await browser.close();

const counted = QUESTIONS.reduce((n, q) => n + q.options.length, 0);
console.log(`question book: ${QUESTIONS.length} questions, ${counted} options, ${FUTURES.length} lenses -> ${OUT}`);
