#!/usr/bin/env node
/**
 * Builds docs/event-pack.pdf — the two things a facilitator carries into the
 * room, in one document: the twenty QR codes, and every question with every
 * option exactly as a phone will show them.
 *
 * WHY THIS EXISTS SEPARATELY from gen-question-book.mjs and
 * gen-flow-book.mjs: those two are about the PIPELINE (what the app asks,
 * what asking it produces). This is the OPERATIONAL pack — print it, cut the
 * cards, and know what the room is about to be asked without opening a
 * laptop.
 *
 * Everything is read, never retyped:
 *   - the QR codes encode `<HOST>/t/N`, the same string `ui/qr.ts` builds
 *     from `page.url.origin`, drawn by the same `qrcode` dependency
 *   - the questions and options are imported from `src/lib/game/`, the
 *     modules the deployed build itself imports
 *   - every table URL is REQUESTED against the live host before it is
 *     printed, and a table that does not answer 200 is marked on the page
 *
 * That last one is the point of the `--verify` pass: a QR code is the one
 * artefact nobody checks until twenty people are pointing phones at it.
 *
 *   node scripts/gen-event-pack.mjs --host https://cognitivecity.zyeta.asia
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import QRCode from 'qrcode';
import { QUESTIONS, WILDCARD, TABLE_COUNT } from '../src/lib/game/questions.ts';
import { FUTURES } from '../src/lib/game/futures.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'docs', 'event-pack.pdf');

const args = process.argv.slice(2);
const HOST = (args[args.indexOf('--host') + 1] ?? 'https://cognitivecity.zyeta.asia').replace(/\/$/, '');
const SKIP_VERIFY = args.includes('--no-verify');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const urlFor = (t) => `${HOST}/t/${t}`;
const tables = Array.from({ length: TABLE_COUNT }, (_, i) => i + 1);

/* Every printed code is fetched first. A 200 is the only thing that makes a
   QR code worth printing; anything else gets a visible mark rather than a
   silent card that fails in the room. */
async function verify(t) {
	if (SKIP_VERIFY) return null;
	try {
		const res = await fetch(`${urlFor(t)}?pack=${Date.now()}`, {
			headers: { 'cache-control': 'no-cache' },
			signal: AbortSignal.timeout(20000)
		});
		return res.status;
	} catch {
		return 0;
	}
}

const codes = await Promise.all(
	tables.map(async (t) => ({
		table: t,
		url: urlFor(t),
		status: await verify(t),
		svg: await QRCode.toString(urlFor(t), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
	}))
);

const bad = codes.filter((c) => c.status !== null && c.status !== 200);
const host = HOST.replace(/^https?:\/\//, '');
const today = new Date().toISOString().slice(0, 10);

function optionList(q) {
	return q.options
		.map((o) => `<li>${esc(o.label)}${o.open ? ' <em>— the table writes its own</em>' : ''}</li>`)
		.join('');
}

const html = `<!doctype html>
<meta charset="utf-8">
<title>Event pack</title>
<style>
	/* Margin ZERO on the page, padding on the body instead.
	   With a 12mm @page margin the printable box is 186mm while the
	   layout viewport is the full 210mm sheet, so the last grid column was
	   laid out in space the printer never prints — three different fixes
	   (minmax, preferCSSPageSize, an A4 viewport) all left it shaved,
	   because none of them addressed the two widths disagreeing. One box,
	   one width, nothing to reconcile. */
	@page { size: A4; margin: 0; }
	body { padding: 12mm; }
	:root { --ink:#11151c; --mut:#5b6472; --line:#d8dde5; --gold:#9a7b3f; --bad:#a33; }
	* { box-sizing: border-box; }
	body { font: 10pt/1.45 -apple-system, "Helvetica Neue", Arial, sans-serif; color: var(--ink); margin:0; }
	h1 { font-size: 24pt; margin: 0 0 4pt; letter-spacing: -0.01em; }
	h2 { font-size: 14pt; margin: 0 0 8pt; padding-bottom: 4pt; border-bottom: 2px solid var(--gold); }
	h3 { font-size: 11pt; margin: 0 0 3pt; }
	.sub { color: var(--mut); margin: 0 0 14pt; }
	.page { page-break-after: always; }
	.page:last-child { page-break-after: auto; }
	/* minmax(0,1fr), not 1fr. A grid track defaults to minmax(AUTO,1fr), and
	   a QR <svg> carries an intrinsic width, so the tracks refused to shrink
	   and the fourth column printed off the right edge of the sheet — twenty
	   codes of which sixteen were usable. Five columns puts all twenty on
	   one page, which is the page somebody cuts up. */
	.grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5mm 4mm; }
	.card svg, .card img { max-width: 100%; }
	.card { border: 1px solid var(--line); border-radius: 3pt; padding: 5pt; text-align: center; page-break-inside: avoid; }
	.card svg { width: 100%; height: auto; display: block; }
	.n { font-size: 13pt; font-weight: 700; margin: 3pt 0 0; }
	.u { font-size: 6pt; color: var(--mut); word-break: break-all; }
	.card.bad { border-color: var(--bad); border-width: 2px; }
	.card.bad .u { color: var(--bad); font-weight: 700; }
	.note { color: var(--mut); font-size: 8.5pt; }
	.warn { color: var(--bad); font-weight: 700; }
	.q { page-break-inside: avoid; margin: 0 0 11pt; padding: 8pt 10pt; border: 1px solid var(--line); border-radius: 3pt; }
	.q .ask { color: var(--mut); font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; margin: 0 0 2pt; }
	ul { margin: 4pt 0 0; padding-left: 16pt; }
	li { margin: 1pt 0; }
	.push { margin: 5pt 0 0; font-size: 9pt; color: var(--mut); }
	.push b { color: var(--ink); }
	.lens { display:grid; grid-template-columns: repeat(2,1fr); gap: 7pt; }
	.lens .one { border:1px solid var(--line); border-radius:3pt; padding:7pt; page-break-inside: avoid; }
	.lens .one p { margin: 2pt 0 0; font-size: 9pt; color: var(--mut); }
</style>

<div class="page">
	<h1>Event pack</h1>
	<p class="sub">Twenty table codes and the whole question set · <b>${esc(host)}</b> · ${today}</p>
	<h2>1 · The table codes</h2>
	<p class="note">
		Each code opens that table's phone flow at <code>${esc(host)}/t/&lt;n&gt;</code>. There is no login —
		the URL is the credential, so a card handed to the wrong table becomes that table.
		${
			SKIP_VERIFY
				? 'Codes were NOT checked against the live host (--no-verify).'
				: bad.length
					? `<span class="warn">${bad.length} of ${TABLE_COUNT} did not answer 200 and are outlined in red — do not print this page.</span>`
					: `All ${TABLE_COUNT} were requested against the live host and answered 200.`
		}
	</p>
	<div class="grid">
		${codes
			.map(
				(c) => `<div class="card${c.status !== null && c.status !== 200 ? ' bad' : ''}">
			${c.svg}
			<p class="n">${c.table}</p>
			<p class="u">${esc(c.url.replace(/^https?:\/\//, ''))}${c.status !== null && c.status !== 200 ? ` · HTTP ${c.status || 'no answer'}` : ''}</p>
		</div>`
			)
			.join('')}
	</div>
</div>

<div class="page">
	<h2>2 · What each table is asked</h2>
	<p class="note">In order, exactly as the phone shows it. Every typed field is optional; only the choices are required.</p>

	<div class="q">
		<p class="ask">Screen 1 · the lens</p>
		<h3>How do you imagine your future cognitive city?</h3>
		<p class="note">Four cities. The pick is hidden analysis — it never appears by name on the wall.</p>
		<div class="lens">
			${FUTURES.map((f) => `<div class="one"><b>${esc(f.name)}</b><p>${esc(f.blurb)}</p></div>`).join('')}
		</div>
	</div>

	${QUESTIONS.map(
		(q, i) => `<div class="q">
		<p class="ask">Screen ${i + 2}</p>
		<h3>${esc(q.prompt)}</h3>
		<ul>${optionList(q)}</ul>
		${q.push ? `<p class="push"><b>Then:</b> ${esc(q.push)} <em>(optional)</em></p>` : ''}
	</div>`
	).join('')}

	<div class="q">
		<p class="ask">Last screen</p>
		<h3>${esc(WILDCARD.prompt)}</h3>
		<p class="note">Free text, 140 characters, drawn verbatim — whatever it says goes into the picture.</p>
	</div>
</div>
`;

await mkdir(join(ROOT, 'docs'), { recursive: true });
const htmlPath = join(ROOT, 'docs', 'event-pack.html');
await writeFile(htmlPath, html, 'utf-8');

const { chromium } = await import('playwright');
const browser = await chromium.launch();
/*
 * A4 at 96dpi is 794x1123 CSS px. The default viewport is 1280 wide, so the
 * layout happens at one width and prints at another — `mm` in the stylesheet
 * and `px` in the layout stop agreeing, and the last grid column comes out
 * shaved by a millimetre or two. Matching the viewport to the paper makes
 * the two units mean the same thing, and `preferCSSPageSize` below then
 * prints exactly what was laid out.
 */
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
/*
 * `preferCSSPageSize`, and it is not optional here.
 *
 * Without it Chromium lays the page out at the 1280px viewport and then
 * prints into A4's ~703px content box, CLIPPING rather than reflowing: the
 * DOM measured as fitting exactly (card 20's right edge at 1280 of 1280)
 * and the printed sheet still lost the last column. Twenty codes of which
 * sixteen were scannable, and the failure is invisible in every check that
 * does not open the PDF. With it, the `@page` rule above is the layout
 * width and the grid reflows into it.
 */
await page.pdf({ path: OUT, preferCSSPageSize: true, printBackground: true });
await browser.close();

console.log(`event pack -> ${OUT}`);
console.log(`host: ${HOST} · ${TABLE_COUNT} codes · ${QUESTIONS.length} questions + lens + wildcard`);
if (bad.length) console.log(`WARNING: ${bad.length} table URL(s) did not answer 200: ${bad.map((b) => b.table).join(', ')}`);
