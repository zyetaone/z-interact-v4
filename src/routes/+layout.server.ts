/**
 * The one piece of server data every page gets: the brand line.
 *
 * A layout load rather than a field on `tableStatus` and `getProjectorRoom`
 * and the photos query and the desk — it belongs to no one of them, it never
 * changes within a deploy, and adding it to four payloads polled every few
 * seconds would send the same constant string down the wire all afternoon.
 *
 * Empty when `BRAND_LINE` is unset, which is the default: this repo carries
 * no company name.
 */
import { envOf } from '$lib/server/env';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ platform }) => {
	return { brand: envOf(platform)?.BRAND_LINE?.trim() ?? '' };
};
