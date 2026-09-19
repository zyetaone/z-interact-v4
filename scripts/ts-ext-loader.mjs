// Minimal resolve hook: lets bare relative TS imports without an extension
// (as written throughout src/lib/game/*.ts) resolve under Node's native
// type-stripping loader. Only used by gen-visuals.mjs at dev time; not part
// of the app build.
export async function resolve(specifier, context, nextResolve) {
	try {
		return await nextResolve(specifier, context);
	} catch (err) {
		if (specifier.startsWith('.') && !specifier.endsWith('.ts')) {
			return nextResolve(`${specifier}.ts`, context);
		}
		throw err;
	}
}
