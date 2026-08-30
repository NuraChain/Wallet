type ClassValue = string | number | boolean | null | undefined | ClassValue[] | Record<string, unknown>;

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

const alignMap = new Set(['left', 'center', 'right', 'justify', 'start', 'end']);

const weightMap = new Set(['thin', 'extralight', 'light', 'normal', 'medium', 'semibold', 'bold', 'extrabold', 'black']);

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

const edgeMap = new Set(['x', 'y', 's', 'e', 't', 'r', 'b', 'l', 'solid', 'dashed', 'dotted', 'double', 'hidden', 'none', 'offset']);

const edgeList = ['border', 'outline', 'ring'] as const;

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

const isLength = (value: string) => /^\[-?\d*\.?\d+(?:px|rem|em|ch|ex|vw|vh|vmin|vmax|%|pt|pc|in|cm|mm)\]$/u.test(value);

const groupOf = (utility: string) => {
    const name = utility.startsWith('-') ? utility.slice(1) : utility;

    if (name.startsWith('text-')) {
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

    if (typeof value === 'object' && value !== null) {
        return Object.keys(value)
            .filter((key) => Boolean(value[key]))
            .join(' ');
    }

    return '';
};

export const cn = (...values: ClassValue[]) => mergeClasses(flattenValue(values));
