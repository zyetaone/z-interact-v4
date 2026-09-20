import { type Page, type Locator, expect } from '@playwright/test';

/** One question's answer for the fidelity run: which option labels to tap, in order. */
export interface QuestionAnswer {
	id: string;
	labels: string[];
	/** The "And:" chip's label to tap, where the question has one and the table answers it. */
	and?: string;
}

export interface TableAnswers {
	table: number;
	future: string; // substring of the lens card's name, unique enough to match
	questions: QuestionAnswer[]; // V4's q2..q11, in FLOW order
	wildcard?: string;
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Page object for `/t/[table]`'s 18-screen tap flow. Selectors are role/text
 * based — the app ships no `data-testid`s, and every option/label is unique
 * visible text, so role+name selectors are both resilient and prove the real
 * UI (not an internal id) is what a table sees.
 */
export class TablePage {
	constructor(private page: Page) {}

	async goto(table: number) {
		await this.page.goto(`/t/${table}`);
	}

	async screenshot(dir: string, name: string) {
		await this.page.screenshot({ path: `${dir}/${name}.png` });
	}

	get heading(): Locator {
		return this.page.locator('h1.stem');
	}

	async begin() {
		await this.page.getByRole('button', { name: /^(Begin|Continue)$/ }).click();
	}

	/**
	 * Screen 3. Picks the future card, then reloads to advance past a
	 * known bug (see REPORT.md): `advance=false` on `saveFuture`/`saveEra`
	 * leaves no forward control once a future is chosen. `resumeIndex`
	 * (server-derived) correctly lands a fresh load on Q2, which is the
	 * app's own documented resume behavior for a replacement phone.
	 */
	async pickFutureAndAdvance(futureNameSubstring: string, dir: string) {
		const card = this.page.getByRole('radio', { name: new RegExp(escapeRegex(futureNameSubstring)) });
		await card.click();
		// Prove the pick landed server-side: the era chip row only renders
		// once `flow.status.future` comes back non-null from the server.
		await expect(this.page.getByRole('region', { name: 'Era' })).toBeVisible({ timeout: 10_000 });
		await this.screenshot(dir, '03-future-stuck-no-continue-button');
		await this.page.reload();
	}

	/** One question screen. Selects each label — a `radio` on single-select questions, a `checkbox` on pick-n — then the optional "And:" chip, then Next. */
	async answerQuestion(answer: QuestionAnswer) {
		for (const label of answer.labels) {
			await this.page
				.getByRole('radio', { name: label, exact: true })
				.or(this.page.getByRole('checkbox', { name: label, exact: true }))
				.click();
		}
		if (answer.and) {
			// The chip row is its own radiogroup, labelled by the sub-question.
			await this.page.getByRole('radiogroup', { name: /^And: / }).getByRole('radio', { name: answer.and, exact: true }).click();
		}
		await this.page.getByRole('button', { name: 'Next' }).click();
	}

	/** Screen 14 — wildcard is optional; skip if no text given. */
	async wildcard(text?: string) {
		if (text) {
			await this.page.getByPlaceholder('One idea, in your own words').fill(text);
			await this.page.getByRole('button', { name: 'Add' }).click();
		} else {
			await this.page.getByRole('button', { name: 'Skip' }).click();
		}
	}

	/** Screen 15 — returns the composed prompt textarea's verbatim text. */
	async readComposedPrompt(): Promise<string> {
		return this.page.locator('#composed').inputValue();
	}

	async submit() {
		await this.page.getByRole('button', { name: 'Draw our workspace' }).click();
	}

	/** Screens 16/17 — polls the phone's own 2s poll until all zone images are `stored`/`done` or the cap elapses. */
	async waitForAllImages(capMs: number): Promise<{ zoneKey: string; state: string }[]> {
		const start = Date.now();
		let last: { zoneKey: string; state: string }[] = [];
		while (Date.now() - start < capMs) {
			const items = this.page.locator('.zones li, .gallery li');
			const count = await items.count();
			if (count > 0) {
				const states: { zoneKey: string; state: string }[] = [];
				for (let i = 0; i < count; i++) {
					const li = items.nth(i);
					const zone = (await li.locator('.zone').textContent())?.trim() ?? '';
					const stateText = (await li.locator('.state').textContent().catch(() => null))?.trim();
					const hasImg = (await li.locator('img').count()) > 0;
					states.push({ zoneKey: zone, state: hasImg ? 'stored' : (stateText ?? 'unknown') });
				}
				last = states;
				if (states.length === 4 && states.every((s) => s.state === 'stored' || s.state === 'done')) {
					return states;
				}
			}
			await this.page.waitForTimeout(2500);
		}
		return last;
	}
}
