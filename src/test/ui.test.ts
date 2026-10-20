import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Primitives take named props, never a class string: no class-string prop is declared, and no HTML attribute spread lets `className` back in. */
const folder = new URL('../ui/', import.meta.url);

const files = readdirSync(folder).filter((name) => /\.tsx?$/u.test(name));

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
