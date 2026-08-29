/**
 * ClassValue - Every shape a call site may hand to {@link cn}.
 *
 * These are the shapes `clsx` accepted, kept exactly so that dropping the dependency changed no call
 * site. `number` is not decoration: `list.length && 'class'` is typed `0 | 'class'`, so a falsy branch
 * reaches here as a number rather than a boolean, and it has to be dropped rather than printed.
 */
type ClassValue = string | number | boolean | null | undefined | ClassValue[] | Record<string, unknown>;

/**
 * Values of `text-*` that set a size rather than a colour.
 *
 * This is the distinction the whole merge turns on. `text-` is the only Tailwind prefix that spells
 * two unrelated properties, and telling them apart from the class name alone needs the app's own
 * scale (`tiny`, `small`, `medium`, `large`, `display` from `style.css`) alongside Tailwind's. Get it
 * wrong and a size looks like a colour: `text-tiny text-txt-error` collapses to one of the two and
 * the alert stops being red, which is exactly what was happening here.
 */
const sizeMap = new Set([
    'tiny',
    'small',
    'medium',
    'large',
    'display',
    'xs',
    'sm',
    'base',
    'lg',
    'xl',
    '2xl',
    '3xl',
    '4xl',
    '5xl',
    '6xl',
    '7xl',
    '8xl',
    '9xl'
]);

/**
 * Values of `text-*` that set the alignment.
 */
const alignMap = new Set(['left', 'center', 'right', 'justify', 'start', 'end']);

/**
 * Values of `font-*` that set the weight; anything else under that prefix is a family.
 */
const weightMap = new Set(['thin', 'extralight', 'light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black']);

/**
 * Prefixes that identify a group, longest first so `min-h` is not read as `m` and `inset-x` is not
 * read as `inset`. A prefix only matches on a whole segment boundary, so `p` claims `p-3` but leaves
 * `pointer-events-none` alone.
 *
 * A class matching nothing here is simply never dropped, which makes an unlisted family fail the safe
 * way: an override that quietly stops working is a bug, a class that survives is at worst noise.
 *
 * `flex` is deliberately absent while `shrink`, `grow` and `basis` are listed: the bare `flex` is a
 * display, `flex-col` a direction, `flex-wrap` a wrap and `flex-1` the shorthand, so one prefix would
 * collapse four properties into one group and `flex flex-col` would lose its display.
 */
const groupList = [
    'min-w',
    'max-w',
    'min-h',
    'max-h',
    'gap-x',
    'gap-y',
    'gap',
    'inset-x',
    'inset-y',
    'inset-s',
    'inset-e',
    'inset',
    'rounded-ss',
    'rounded-se',
    'rounded-ee',
    'rounded-es',
    'rounded-tl',
    'rounded-tr',
    'rounded-br',
    'rounded-bl',
    'rounded-t',
    'rounded-r',
    'rounded-b',
    'rounded-l',
    'rounded-s',
    'rounded-e',
    'rounded',
    'overflow-x',
    'overflow-y',
    'overflow',
    'px',
    'py',
    'ps',
    'pe',
    'pt',
    'pr',
    'pb',
    'pl',
    'p',
    'mx',
    'my',
    'ms',
    'me',
    'mt',
    'mr',
    'mb',
    'ml',
    'm',
    'top',
    'right',
    'bottom',
    'left',
    'size',
    'w',
    'h',
    'z',
    'bg',
    'shadow',
    'opacity',
    'cursor',
    'leading',
    'tracking',
    'duration',
    'items',
    'justify',
    'self',
    'order',
    'shrink',
    'grow',
    'basis'
] as const;

/**
 * Longhands a shorthand blanks out when it lands later, mirroring the order Tailwind emits them in:
 * `p-4` after `px-2` wins outright, while `px-2` after `p-4` narrows only the horizontal axis.
 *
 * `ps` and `pe` are deliberately absent from `px`, since a logical inset and a physical one are
 * separate declarations that Tailwind orders so the logical pair wins on its own.
 */
const clearMap: Record<string, readonly string[]> = {
    p: ['px', 'py', 'ps', 'pe', 'pt', 'pr', 'pb', 'pl'],
    px: ['pr', 'pl'],
    py: ['pt', 'pb'],
    m: ['mx', 'my', 'ms', 'me', 'mt', 'mr', 'mb', 'ml'],
    mx: ['mr', 'ml'],
    my: ['mt', 'mb'],
    gap: ['gap-x', 'gap-y'],
    size: ['w', 'h'],
    inset: ['inset-x', 'inset-y', 'inset-s', 'inset-e', 'top', 'right', 'bottom', 'left'],
    'inset-x': ['right', 'left'],
    'inset-y': ['top', 'bottom'],
    overflow: ['overflow-x', 'overflow-y'],
    rounded: [
        'rounded-t',
        'rounded-r',
        'rounded-b',
        'rounded-l',
        'rounded-s',
        'rounded-e',
        'rounded-tl',
        'rounded-tr',
        'rounded-br',
        'rounded-bl',
        'rounded-ss',
        'rounded-se',
        'rounded-ee',
        'rounded-es'
    ]
};

/**
 * Values of `border-*`, `outline-*` and `ring-*` that are a side, a style or an offset rather than a
 * colour. Widths are caught separately, by the leading digit or bracket.
 */
const edgeMap = new Set(['x', 'y', 's', 'e', 't', 'r', 'b', 'l', 'solid', 'dashed', 'dotted', 'double', 'hidden', 'none', 'offset']);

/**
 * The three families that spell a width, a side, a style and a colour with one prefix.
 */
const edgeList = ['border', 'outline', 'ring'] as const;

/**
 * edgeGroup - Names the colour slot of an edge family, or `undefined` for everything else it spells.
 *
 * These need a group because the app genuinely overrides one: a field in its error state passes
 * `border-input-error` over the recipe's `border-input-normal`, and a selected row passes
 * `border-btn-primary-border` over `border-btn-muted-border`. Without a group both survive and
 * stylesheet order decides, which is the invisible failure `cn` exists to remove.
 *
 * They must *only* group the colour. Grouping the whole prefix means the bare `border` — which is the
 * only thing that sets a width, since Tailwind's preflight resets every border to `0 solid` — is
 * dropped the moment a colour follows it, and every bordered surface in the app renders at zero
 * width. The same shape costs `outline-2 outline-offset-2 outline-double` their meaning and leaves
 * every focus ring invisible. Both of those shipped for exactly one commit.
 * @param {string} name The utility, with variants and the important marker already stripped.
 * @returns {string | undefined} The colour group, or `undefined` to always keep the class.
 */
const edgeGroup = (name: string) => {
    for (const family of edgeList) {
        if (name === family) {
            return undefined;
        }

        if (name.startsWith(`${family}-`)) {
            const value = name.slice(family.length + 1).split('/')[0];

            if (/^[\d[]/u.test(value) || edgeMap.has(value.split('-')[0])) {
                return undefined;
            }

            return `${family}-color`;
        }
    }

    return undefined;
};

/**
 * isLength - Whether a bracketed `text-[...]` value is a size rather than a colour.
 *
 * Without this, an arbitrary size fell through to `text-color` and displaced a real colour. It was
 * not hypothetical: `text-[0.5rem]` on the browser tab strip's favicon fallback was knocking out
 * `TokenIcon`'s `text-txt-reverse`, so the letter rendered in the inherited colour on a coloured
 * disc — and both font sizes survived onto the element, leaving stylesheet order to pick one.
 *
 * A colour can also be bracketed (`text-[#fff]`, `text-[oklch(...)]`), so the test is for a leading
 * number with a length unit rather than for the brackets themselves.
 * @param {string} value The part after `text-`, with any slash suffix already removed.
 * @returns {boolean} Whether it parses as a length.
 */
const isLength = (value: string) => /^\[-?\d*\.?\d+(?:px|rem|em|ch|ex|vw|vh|vmin|vmax|%|pt|pc|in|cm|mm)\]$/u.test(value);

/**
 * groupOf - Names the property family a utility writes to, or `undefined` when it is not one that can
 * be overwritten from a call site.
 * @param {string} utility The utility, with any variants and the important marker already stripped.
 * @returns {string | undefined} The family name, or `undefined` to always keep the class.
 */
const groupOf = (utility: string) => {
    const name = utility.startsWith('-') ? utility.slice(1) : utility;

    if (name.startsWith('text-')) {
        // The part after a slash is the line height on a size and the opacity on a colour, so it says
        // nothing about which of the two this is.
        const value = name.slice(5).split('/')[0];

        if (sizeMap.has(value) || isLength(value)) {
            return 'font-size';
        }

        return alignMap.has(value) ? 'text-align' : 'text-color';
    }

    if (name.startsWith('font-')) {
        return weightMap.has(name.slice(5)) ? 'font-weight' : 'font-family';
    }

    if (edgeList.some((family) => name === family || name.startsWith(`${family}-`))) {
        return edgeGroup(name);
    }

    return groupList.find((prefix) => name === prefix || name.startsWith(`${prefix}-`));
};

/**
 * mergeClasses - Drops every utility a later one overwrites.
 *
 * Which class wins in the browser is decided by the order Tailwind wrote them into the stylesheet,
 * not by the order they appear in the attribute — so a component's default can beat the override a
 * call site passed, silently and depending on nothing the call site can see. Removing the loser here
 * is what makes "the last one wins" true.
 *
 * Variants are part of the key, so `hover:opacity-50` never displaces a plain `opacity-100`, and
 * `sm:w-fit` never displaces `w-full`.
 * @param {string} value The space-separated class list.
 * @returns {string} The list with overwritten utilities removed.
 */
const mergeClasses = (value: string) => {
    const parts = value.split(' ').filter((item) => item.length > 0);

    const names = new Set<string>();
    const groups = new Set<string>();
    const result: string[] = [];

    for (let index = parts.length - 1; index >= 0; index--) {
        const part = parts[index];

        if (names.has(part)) {
            continue;
        }

        const split = part.lastIndexOf(':');
        const variant = split === -1 ? '' : part.slice(0, split + 1);
        const group = groupOf((split === -1 ? part : part.slice(split + 1)).replace(/!$/u, ''));

        if (group !== undefined) {
            const key = variant + group;

            if (groups.has(key)) {
                continue;
            }

            groups.add(key);

            for (const cleared of clearMap[group] ?? []) {
                groups.add(variant + cleared);
            }
        }

        names.add(part);

        result.push(part);
    }

    return result.reverse().join(' ');
};

/**
 * flattenValue - Reduces a class value of any shape to a plain space-separated string.
 *
 * This is the half of `cn` that `clsx` used to do, and it keeps that library's one rule: anything
 * falsy is dropped wherever it appears. That is what makes `condition && 'class'` work, and it is why
 * `0` is discarded rather than emitted as a class named `0`.
 *
 * The truthiness tests are spelled out rather than written as `!value` because the lint config runs
 * `strict-boolean-expressions`, which rejects an implicit coercion on a union this wide.
 * @param {ClassValue} value A string, number, boolean, nullish value, array or record.
 * @returns {string} The classes it contributes, or an empty string when it contributes none.
 */
const flattenValue = (value: ClassValue): string => {
    if (typeof value === 'string') {
        return value;
    }

    if (typeof value === 'number') {
        return value === 0 || Number.isNaN(value) ? '' : `${value}`;
    }

    if (Array.isArray(value)) {
        const parts: string[] = [];

        for (const item of value) {
            const part = flattenValue(item);

            if (part.length > 0) {
                parts.push(part);
            }
        }

        return parts.join(' ');
    }

    // `typeof null` is also `object`, so the null check is what separates a record from a nullish
    // conditional that collapsed to nothing.
    if (typeof value === 'object' && value !== null) {
        return Object.keys(value)
            .filter((key) => Boolean(value[key]))
            .join(' ');
    }

    return '';
};

/**
 * cn - Combines class values and resolves Tailwind conflicts.
 *
 * `flattenValue` handles the conditional shapes (`value && 'class'`, arrays), then `mergeClasses` makes
 * the last conflicting utility win — so a caller's `className` can override a component's default the
 * way a prop override is expected to behave. Plain string concatenation would emit both classes and
 * leave the winner to stylesheet order, which is invisible at the call site and easy to get backwards.
 * @param {...ClassValue} values Class strings, conditionals, or arrays of either.
 * @returns {string} The merged class string.
 */
export const cn = (...values: ClassValue[]) => mergeClasses(flattenValue(values));
