/**
 * Assertions for the one thing in `cn` that is easy to get catastrophically wrong.
 *
 * `text-`, `border-`, `outline-` and `ring-` are the prefixes that spell more than one CSS property,
 * and mis-grouping one is silent: nothing throws, the build passes, the types are fine, and every
 * bordered surface in the app renders at `border-width: 0` — because Tailwind's preflight resets
 * borders to `0 solid`, and the bare `border` that restores the width was dropped in favour of a
 * colour that shared its prefix. The focus ring fails the same way in the same commit. Both of those
 * shipped once, which is why this file exists.
 *
 * Cases assert which classes survive rather than the exact output string, because the lint config
 * rewrites class literals into canonical order — including the ones in here. Survival is the real
 * invariant; the order is Tailwind's business.
 *
 * Run with `npm run check`, which the build runs too.
 */

import { cn } from '../src/utility/cn.ts';

/**
 * A case: what the merge is, what has to come out of it, and what must not.
 */
interface Case { what: string; got: string; keep: string[]; drop: string[] }

const cases: Case[] =
[
    {
        what: 'a border width survives a colour that shares its prefix',
        got: cn('border border-input-normal', 'bg-input-bg'),
        keep: [ 'border', 'border-input-normal', 'bg-input-bg' ],
        drop: [ ]
    },
    {
        what: 'a border colour override still wins',
        got: cn('border border-input-normal', 'border-input-error'),
        keep: [ 'border', 'border-input-error' ],
        drop: [ 'border-input-normal' ]
    },
    {
        what: 'a border side keeps its width',
        got: cn('flex', 'border-b border-line'),
        keep: [ 'flex', 'border-b', 'border-line' ],
        drop: [ ]
    },
    {
        what: 'the focus ring keeps its width, offset and style',
        got: cn('outline-2 outline-offset-2 outline-transparent outline-double'),
        keep: [ 'outline-2', 'outline-offset-2', 'outline-double', 'outline-transparent' ],
        drop: [ ]
    },
    {
        what: 'a focus-visible colour does not displace the resting one',
        got: cn('outline-transparent focus-visible:outline-focus-ring'),
        keep: [ 'outline-transparent', 'focus-visible:outline-focus-ring' ],
        drop: [ ]
    },
    {
        what: 'an arbitrary text size is a size, not a colour',
        got: cn('text-txt-reverse', 'text-[0.5rem]'),
        keep: [ 'text-txt-reverse', 'text-[0.5rem]' ],
        drop: [ ]
    },
    {
        what: 'a named text size still merges with another size',
        got: cn('text-tiny', 'text-small'),
        keep: [ 'text-small' ],
        drop: [ 'text-tiny' ]
    },
    {
        what: 'a text size does not displace a text colour',
        got: cn('text-tiny text-txt-error'),
        keep: [ 'text-tiny', 'text-txt-error' ],
        drop: [ ]
    },
    {
        what: 'a display survives a direction',
        got: cn('flex flex-col'),
        keep: [ 'flex', 'flex-col' ],
        drop: [ ]
    },
    {
        what: 'a shorthand clears the longhands it covers',
        got: cn('px-3 py-2', 'p-4'),
        keep: [ 'p-4' ],
        drop: [ 'px-3', 'py-2' ]
    }
];

/**
 * check - Which of a case's expectations the merge failed.
 * @param {Case} item The case.
 * @returns {string[]} One line per broken expectation.
 */
const check = (item: Case) =>
{
    const out = new Set(item.got.split(' '));

    return [
        ...item.keep.filter((name) => !out.has(name)).map((name) => `dropped ${ name }`),
        ...item.drop.filter((name) => out.has(name)).map((name) => `kept ${ name }`)
    ];
};

let broken = 0;

for (const item of cases)
{
    const faults = check(item);

    process.stdout.write(`${ faults.length === 0 ? 'ok  ' : 'FAIL' } ${ item.what }\n`);

    if (faults.length > 0)
    {
        broken++;

        process.stdout.write(`       ${ faults.join(', ') }\n       got: ${ item.got }\n`);
    }
}

if (broken > 0)
{
    process.stderr.write(`\n${ broken } of ${ cases.length } cn cases failed\n`);

    process.exit(1);
}

process.stdout.write(`\nall ${ cases.length } cn cases pass\n`);
