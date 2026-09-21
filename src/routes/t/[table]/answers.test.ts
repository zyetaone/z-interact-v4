import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('every free-text field a phone can send has a ceiling', () => {
	// Two of them did not. `pushReply` and the open-option `text` map both
	// reach the image prompt verbatim through layers.ts, so an unbounded
	// string was an unbounded prompt on a wall in front of the room. The
	// wildcard and the screen-15 rewrite were already capped; these are the
	// two that were missed, so the test reads the source rather than
	// exercising a handler, and fails if a cap is dropped again.
	const SRC = readFileSync(
		join(process.cwd(), 'src/routes/t/[table]/answers.remote.ts'),
		'utf8'
	);

	it('caps pushReply everywhere it is accepted', () => {
		expect(SRC).not.toMatch(/pushReply:\s*v\.optional\(v\.string\(\)\)/);
		expect(SRC).toContain('pushReply: v.optional(v.pipe(v.string(), v.maxLength(FREE_TEXT_MAX)))');
	});

	it('caps the open-option text map', () => {
		expect(SRC).not.toMatch(/v\.record\(v\.string\(\),\s*v\.string\(\)\)/);
		expect(SRC).toMatch(/v\.record\(\s*v\.string\(\),\s*v\.pipe\(v\.string\(\), v\.maxLength\(FREE_TEXT_MAX\)\)/);
	});
});
