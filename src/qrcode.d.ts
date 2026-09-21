/**
 * `qrcode` ships no types and this app uses exactly one of its functions.
 * A six-line declaration beats a devDependency for that, and it types the
 * options we actually pass rather than the whole surface.
 */
declare module 'qrcode' {
	export function toDataURL(
		text: string,
		options?: {
			errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
			margin?: number;
			width?: number;
			color?: { dark?: string; light?: string };
		}
	): Promise<string>;
	const _default: { toDataURL: typeof toDataURL };
	export default _default;
}
