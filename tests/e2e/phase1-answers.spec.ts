import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { TablePage } from './pages/table.page';
import { ALL_TABLES } from './table-configs';
import type { TableAnswers } from './pages/table.page';

/**
 * Phase 1 — drives screens 1-15 (landing through review) for all three
 * tables, screenshots every screen, and captures the composed prompt
 * verbatim. Deliberately stops at the review screen without submitting:
 * submission (screens 16/17) spends real fal credits and is handled by
 * phase 2, gated on a valid model id.
 */
for (const table of ALL_TABLES) {
	test(`table ${table.table} — screens 1-15`, async ({ page }) => {
		const dir = `docs/fidelity/table-${table.table}`;
		mkdirSync(dir, { recursive: true });
		const t = new TablePage(page);

		await t.goto(table.table);
		await expect(t.heading).toContainText('Draw the workspace');
		await t.screenshot(dir, '01-landing');

		await t.begin();
		await expect(t.heading).toContainText('Pick the future');
		await t.screenshot(dir, '02-future');

		await t.pickFutureAndAdvance(table.future, dir);
		// after reload, resumeIndex should land on Q2
		await expect(t.heading).toContainText(getQuestionPrompt('q2'));
		await t.screenshot(dir, '04-q2-after-reload');

		let shot = 5;
		for (const qa of table.questions) {
			await expect(t.heading).toContainText(getQuestionPrompt(qa.id));
			await t.screenshot(dir, `${String(shot).padStart(2, '0')}-${qa.id}`);
			await t.answerQuestion(qa);
			shot++;
		}

		await expect(t.heading).toContainText('What else?');
		await t.screenshot(dir, `${String(shot).padStart(2, '0')}-wildcard`);
		shot++;
		await t.wildcard(table.wildcard);

		await expect(t.heading).toContainText('Read it back');
		await t.screenshot(dir, `${String(shot).padStart(2, '0')}-review`);

		const composed = await t.readComposedPrompt();
		writeFileSync(`${dir}/prompt.txt`, composed, 'utf8');
		expect(composed.length).toBeGreaterThan(0);
	});
}

// Local copy of the question stems the assignment brief lists, so this spec
// doesn't have to reach into `$lib/game/questions` (a SvelteKit alias not
// resolvable from a plain Playwright test file without extra config).
const PROMPTS: Record<string, string> = {
	q2: 'What is your material world?',
	q3: 'How does a visitor find their way in?',
	q4: 'How do employees move through the space?',
	q5: 'Which features protect attention?',
	q6: 'What do you sit on, and where do you meet?',
	q7: 'Is the technology obvious or invisible?',
	q8: 'How much nature, and where?',
	q9: 'How does the building sense and learn?',
	q10: 'What runs itself, and what stays human?',
	q11: 'In three words, what should it feel like?'
};

function getQuestionPrompt(id: string): string {
	return PROMPTS[id];
}
