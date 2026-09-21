/**
 * ONE QR DRAWER, for the two pages that draw twenty of them.
 *
 * `/admin/cards` (the printable set) and `/` (the room grid) each carried
 * their own copy of the same loop, and the copies had already drifted:
 * margin 4 on one and 3 on the other, for codes that are scanned in the
 * same room off the same URLs. The 21 Sep route review is where that was
 * noticed; this is the merge.
 *
 * WHAT IS SHARED IS THE SCANNING, NOT THE SIZE. Error correction, the quiet
 * zone and the two colours are properties of "a code photographed off a
 * creased card or an angled screen in a dim room" and belong here. `width`
 * stays a per-caller argument because a print sheet and a 20-up grid want
 * genuinely different pixel budgets.
 *
 * ponytail: drawn in the browser, not on the server — `qrcode` reaches for
 * canvas and node APIs on some paths and none of that has to work in a
 * Worker if the browser draws. Both callers already did it this way; this
 * only stops them doing it twice.
 */
import QRCode from 'qrcode';

/** High correction and a generous quiet zone: this gets photographed at an angle. */
const SCAN_OPTIONS = {
	errorCorrectionLevel: 'H',
	margin: 4,
	color: { dark: '#0b1020ff', light: '#ffffffff' }
} as const;

/**
 * Data URLs for every table's `/t/<n>` code, keyed by table number.
 *
 * Sequential on purpose: twenty codes at 900px is the whole job and a
 * `Promise.all` of twenty canvas encodes on a facilitator's laptop is how
 * a print page janks while someone is waiting to print it.
 */
export async function drawTableCodes(
	tables: readonly number[],
	urlFor: (table: number) => string,
	width: number
): Promise<Record<number, string>> {
	const out: Record<number, string> = {};
	for (const t of tables) {
		out[t] = await QRCode.toDataURL(urlFor(t), { ...SCAN_OPTIONS, width });
	}
	return out;
}
