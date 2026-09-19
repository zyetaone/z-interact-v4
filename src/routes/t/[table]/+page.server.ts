/**
 * Table-range guard — same role as z-presence's `tables/[table]` guard.
 * The URL is untrusted input (ADR-036 §3: "the URL is the credential, but
 * not an auth token"), so it's re-validated here even though the client
 * likely only ever sees valid QR codes.
 */
import { redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { TABLE_COUNT } from '$lib/game/questions';
import type { PageServerLoad } from './$types';

const TableNo = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(TABLE_COUNT));

export const load: PageServerLoad = async ({ params }) => {
	const parsed = v.safeParse(TableNo, Number(params.table));
	if (!parsed.success) {
		redirect(307, '/');
	}
	return { table: parsed.output };
};
