import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * `src/ui` is the design system, and a primitive says what it is through named props — never
 * through a class string handed in by the caller. A `className` escape hatch is how a catalog
 * turns back into one-off surfaces, so this pins it shut: no class-string prop is declared, and
 * no spread of HTML attributes lets `className` back in unnoticed.
 */
const folder = new URL('./', import.meta.url);

const files = readdirSync(folder).filter((name) => /\.tsx?$/u.test(name) && !name.endsWith('.test.ts'));

describe('src/ui', () => {
    it.each(files)('%s declares no class-string prop', (name) => {
        const source = readFileSync(new URL(name, folder), 'utf8');

        expect(source).not.toMatch(/\b(?:className|[a-z]\w*Class)\??\s*:/u);
    });

    it.each(files)('%s omits className from every attribute type it spreads', (name) => {
        const source = readFileSync(new URL(name, folder), 'utf8');

        for (const match of source.matchAll(/\b(?:\w*HTMLAttributes|ComponentProps\w*)</gu)) {
            const before = source.slice(Math.max(0, match.index - 16), match.index);
            const after = source.slice(match.index, match.index + 160);

            expect(before, `${name}: ${after.slice(0, 40)}`).toMatch(/Omit<\s*$/u);
            expect(after, `${name}: ${after.slice(0, 40)}`).toMatch(/^[^;]*?,\s*[^>]*'className'/u);
        }
    });
});
