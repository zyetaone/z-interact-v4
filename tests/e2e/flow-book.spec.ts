/**
 * CAPTURES THE FLOW AS IT IS TODAY, for `scripts/gen-flow-book.mjs`.
 *
 * `docs/screens/` was shot against the ELEVEN-question set and still holds
 * `06-q3-arrive`, `07-q4-workstation`, `10-q7-technology`,
 * `12-q10-brilliant-at-one` and `13-q11-three-words` — five screens the
 * 21 Sep cut deleted. A reviewer reading that folder is reading last week's
 * app. This writes `docs/flow/` from the running UI instead, so the flow
 * book cannot document screens that no longer exist.
 *
 * Every selector is role+visible-text: the app ships no test ids, so this
 * only passes if a real table could tap the same things.
 *
 *   FAL_FAKE=1 AI_FAKE=1 npm run dev -- --port 5173 --strictPort
 *   npx playwright test tests/e2e/flow-book.spec.ts
 *
 * ponytail: FAL_FAKE means the last screen shows the placeholder, not a
 * render — the prompt it captures is the real composed one either way, and
 * the book pairs it with a real render from `docs/fidelity/`. Point this at
 * a dev server with a live FAL_KEY and no FAL_FAKE to get both from one run.
 */
import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const DIR = 'docs/flow';
const TABLE = 4;

/** One table's answers — one per question, chosen to be visibly different from each other in the render. */
// The 21 Sep 19:42 order: materials, outdoors, deep work, recharge.
// The slider was removed on 22 Sep — q8 is three radios like every other
// question now, so there is no special case left in this loop.
const PICKS: { label: string }[] = [
	{ label: 'Earth and timber' },
	{ label: '20%' },
	{ label: 'The dome in the rainforest' },
	{ label: 'The hydro sensory room' }
];

const PUSHES = [
	'Rammed earth and cool brass.',
	'Rain trees over the courtyards, so the shade moves with the day.',
	'Deciding who gets promoted.',
	'Twenty minutes where nobody can find us.'
];

const WILDCARD = 'A staircase that is also a place to sit and watch the room.';

async function shoot(page: Page, name: string) {
	await page.waitForTimeout(350);
	await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

test('captures every screen of the five-question flow', async ({ page }) => {
	test.setTimeout(180_000);
	await mkdir(DIR, { recursive: true });

	await page.goto(`/t/${TABLE}`);
	await expect(page.locator('h1.stem')).toBeVisible();
	await shoot(page, '01-landing');

	// THIS TABLE MUST BE CLEAN. Local D1 persists between runs, so a second
	// run lands on the done screen and this waits three minutes for a button
	// that is not there. `npm run flow:reset` drops table 4's rows.
	const start = page.getByRole('button', { name: /Start here|Pick up where/ });
	await expect(start, 'table is not at the landing screen — reset it first').toBeVisible({ timeout: 10_000 });
	await start.click();

	// Screen two — the lens. Shot before and after the pick, because the era
	// chip row only exists once the pick has landed server-side.
	await expect(page.locator('h1.stem')).toContainText('cognitive city');
	await shoot(page, '02-lens');
	await page.getByRole('radio', { name: /garden city/i }).click();
	// The era chip was removed on 22 Sep, and it was what this waited on to
	// prove the pick had landed SERVER-side. `Next` only renders once the
	// server has answered with a future, so it proves the same thing.
	await expect(page.getByRole('button', { name: 'Next' })).toBeVisible({ timeout: 15_000 });
	await shoot(page, '03-lens-chosen');
	await page.reload();

	const prompts: string[] = [];
	const typed: (string | null)[] = PICKS.map(() => null);
	for (let i = 0; i < PICKS.length; i++) {
		const stem = (await page.locator('h1.stem').textContent())?.trim() ?? '';
		prompts.push(stem);
		await page.getByRole('radio', { name: PICKS[i].label, exact: true }).click();
		// The typed reply — every question captures one now, which is the
		// 21 Sep "allow open text below" note. Filled here so the book shows
		// the field with real words in it rather than an empty box.
		// THREE OF THE FOUR BOXES ARE GONE (22 Sep). q8's and q5c's were
		// removed and q6r's became an open option, so only q2 still has one.
		// `typed[i]` records what was actually filled — the book used to print
		// PUSHES[i] under every question whether a box existed or not, which
		// would now caption three screenshots with words nobody typed.
		const box = page.locator('#push');
		if (await box.count()) {
			await box.fill(PUSHES[i]);
			typed[i] = PUSHES[i];
		}
		await shoot(page, `0${4 + i}-q${i + 1}`);
		await page.getByRole('button', { name: 'Next' }).click();
		// Wait for the stem to CHANGE, not for a fixed delay. A flat timeout
		// logged each question against the PREVIOUS screen's stem — the first
		// capture recorded "Where does deep work happen? -> The water room",
		// which is the recharge answer under the deep-work heading.
		await expect(page.locator('h1.stem')).not.toHaveText(stem, { timeout: 15_000 });
	}

	// Anchored on the FIELD, not the wording. The wildcard's stem has been
	// reworded twice in one evening ("What have we missed?" -> "Any other
	// flights of fancy?") and pinning the sentence failed both times.
	await expect(page.getByPlaceholder('One idea, in your own words')).toBeVisible({ timeout: 15_000 });
	await page.getByPlaceholder('One idea, in your own words').fill(WILDCARD);
	await shoot(page, '08-wildcard');
	await page.getByRole('button', { name: 'Add' }).click();

	// The prompt is COLLAPSED by default now, so the review screen is the
	// answers and the button. Shot closed first, because that is the screen a
	// table actually sees, then opened for the book's second capture.
	await expect(page.getByRole('button', { name: 'Draw our workspace' })).toBeVisible({ timeout: 15_000 });
	await shoot(page, '09-review');

	await page.locator('details.prompt-box summary').click();
	await expect(page.locator('#composed')).toBeVisible({ timeout: 10_000 });
	// Read-only in a hero room (a <p>), a textarea in a four-zone one.
	const box = page.locator('#composed');
	const composed =
		(await box.evaluate((el) => el.tagName)) === 'TEXTAREA'
			? await box.inputValue()
			: ((await box.textContent()) ?? '');
	await shoot(page, '09b-review-prompt');

	await page.getByRole('button', { name: 'Draw our workspace' }).click();
	await page.waitForTimeout(2500);
	await shoot(page, '10-drawing');

	// WAIT FOR THE PICTURE, NOT FOR THE SCREEN. The first run asserted on
	// "You're in|Being drawn" and matched "Being drawn" on the spot, so the
	// drawing and done captures were the same pixels and no render was ever
	// waited for. A real fal render is one to three minutes; the thing that
	// proves it landed is an <img> with bytes behind it.
	const shot = page.locator('.thumbs img, .gallery img').first();
	await expect(shot).toBeVisible({ timeout: 240_000 });
	await page.waitForTimeout(2500);
	await shoot(page, '11-done');

	// Pull the rendered bytes straight off the app's own R2 read path, so the
	// book shows the file the phone showed rather than a re-encoded crop.
	const src = await shot.getAttribute('src');
	if (src) {
		const bytes = await (await page.request.get(new URL(src, page.url()).toString())).body();
		await writeFile(`${DIR}/workspace.jpg`, bytes);
	}

	await writeFile(
		`${DIR}/composed-prompt.txt`,
		`table ${TABLE} · the garden city\n` +
			`${prompts.map((p, i) => `Q${i + 1} ${p} -> ${PICKS[i].label}${typed[i] ? `\n    typed: ${typed[i]}` : ''}`).join('\n')}\n` +
			`wildcard: ${WILDCARD}\n\n` +
			`--- composed (${composed.length} characters) ---\n${composed}\n`,
		'utf-8'
	);
	expect(composed.length).toBeGreaterThan(200);
});
