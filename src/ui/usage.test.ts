import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAst } from 'rolldown/parseAst';

/**
 * How the rest of the app may use `src/ui`, checked on every file outside it. A rule a reviewer
 * has to remember is a rule that erodes one call site at a time; these fail the suite instead.
 */
const src = fileURLToPath(new URL('../', import.meta.url));
const ui = resolve(src, 'ui');

const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);

        if (entry.isDirectory()) {
            return full === ui ? [] : walk(full);
        }

        return entry.name.endsWith('.tsx') ? [full] : [];
    });

interface Node {
    type: string;
    start: number;
    [key: string]: unknown;
}

const visit = (node: unknown, fn: (node: Node) => void) => {
    if (Array.isArray(node)) {
        for (const item of node) {
            visit(item, fn);
        }

        return;
    }

    if (node === null || typeof node !== 'object') {
        return;
    }

    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const record = node as Node;

    if (typeof record.type === 'string') {
        fn(record);
    }

    for (const value of Object.values(record)) {
        visit(value, fn);
    }
};

const files = walk(src).map((file) => {
    const source = readFileSync(file, 'utf8');

    return { name: relative(src, file).replaceAll('\\', '/'), source, ast: parseAst(source, { lang: 'tsx' }, file) };
});

const lineOf = (source: string, offset: number) => source.slice(0, offset).split('\n').length;

describe('outside src/ui', () => {
    it.each(files)('$name gives a Button its glyph through `icon`, not as a child', ({ source, ast }) => {
        const found: number[] = [];

        visit(ast, (node) => {
            // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const element = node as unknown as { type: string; openingElement?: { name: { name?: string } }; children?: Node[] };

            if (element.type !== 'JSXElement' || element.openingElement?.name.name !== 'Button') {
                return;
            }

            const children = (element.children ?? []).filter((child) => !(child.type === 'JSXText' && String(child.value).trim() === ''));

            const lone = children.length === 1 ? children[0] : undefined;

            if (lone === undefined) {
                return;
            }

            // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const name = (lone as unknown as { openingElement?: { name: { type: string; name?: string } } }).openingElement?.name;

            const glyph =
                (lone.type === 'JSXExpressionContainer' && (lone.expression as Node).type !== 'JSXEmptyExpression') ||
                (lone.type === 'JSXElement' && (name?.type === 'JSXMemberExpression' || /^[A-Z]/u.test(name?.name ?? '')));

            if (glyph) {
                found.push(lineOf(source, node.start));
            }
        });

        expect(found, 'a lone icon child: pass it as icon={…}').toEqual([]);
    });
});
