/**
 * PROJECTOR DESIGN TOKENS — Navy-Gold Ledger, presenter/"lifted" variant
 * (design-direction.md Direction 1, the presenter column, not the phone
 * column: a projector's black lifts by ambient bounce, so this stage is a
 * step lighter and higher-contrast than the table phones would be).
 *
 * This repo has no global CSS yet (fresh scaffold — no z-presence token
 * layer was ported), so these are declared fresh rather than re-tuned from
 * an existing sheet. Scoped to the projector route only; not a claim about
 * what the phone or admin screens should use.
 */
export const TOKENS = {
	ground: '#16233a',
	card: '#1f2f4a',
	cardAlpha: 'rgba(31, 47, 74, 0.4)',
	ink: '#ffffff',
	inkMuted: 'rgba(255, 255, 255, 0.6)',
	gold: '#e0bd7c',
	teal: '#4fe0c4',
	line: 'rgba(255, 255, 255, 0.28)'
} as const;

/**
 * One accent per future, palette-indexed rather than hand-mapped to keys —
 * so a future rename in futures.ts can't silently leave an accent orphaned.
 * Values chosen to read against the navy ground at projector viewing
 * distance (design-direction.md §4 "what to avoid": no pastel-on-navy).
 */
const ACCENT_PALETTE = ['#4fe0c4', '#e0bd7c', '#8fae87', '#e0475c', '#7ea8d8', '#c9a05a', '#9fa8da'];

export function accentForFuture(index: number): string {
	return ACCENT_PALETTE[index % ACCENT_PALETTE.length];
}

export const BEAT_LABEL: Record<string, string> = {
	'not-started': 'not started',
	choosing: 'choosing',
	answering: 'answering',
	reviewing: 'reviewing',
	drawing: 'drawing',
	done: 'in'
};
