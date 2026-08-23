/**
 * Contrast gate for the colour tokens in `src/assets/style.css`.
 *
 * The palette is authored in `oklch()` and read by a browser, so a value that fails WCAG fails
 * silently and only in the one theme nobody had open. This parses the two `[data-theme]` blocks out
 * of the stylesheet itself — not a copy of them kept in step by hand — converts each token through
 * oklab to linear sRGB, and asserts the pairs that carry meaning:
 *
 *   - body text on every surface it can land on        >= 4.5:1  (WCAG 1.4.3)
 *   - a reversed label on every fill that carries one  >= 4.5:1
 *   - the boundary of a control the user has to find   >= 3:1    (WCAG 1.4.11)
 *
 * Decorative hairlines are deliberately absent: `--line` separates surfaces that are already
 * distinguished by their own fill, so it is never the sole means of identifying anything.
 *
 * Runs as part of `npm run build`, or on its own with `npm run contrast`. Exits non-zero listing
 * every pair that failed.
 */

import { readFileSync } from 'node:fs';

/**
 * oklchToLinear - Converts one `oklch()` triple to linear-light sRGB.
 * @param {number} lightness Perceptual lightness, 0-1.
 * @param {number} chroma Chroma.
 * @param {number} hue Hue in degrees.
 * @returns {{ r: number, g: number, b: number }} Linear sRGB, clamped to gamut.
 */
const oklchToLinear = (lightness, chroma, hue) =>
{
    const radians = (hue * Math.PI) / 180;

    const a = chroma * Math.cos(radians);
    const b = chroma * Math.sin(radians);

    const lCube = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const mCube = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const sCube = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;

    /**
     * clamp - Holds one channel inside the displayable range.
     * @param {number} value The channel.
     * @returns {number} The channel, clamped to 0-1.
     */
    const clamp = (value) => Math.min(1, Math.max(0, value));

    return {
        r: clamp(4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube),
        g: clamp(-1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube),
        b: clamp(-0.0041960863 * lCube - 0.7034186147 * mCube + 1.7076147010 * sCube)
    };
};

/**
 * Matches the three components of an `oklch()` value. Alpha is deliberately not captured: every
 * token this checks is opaque, and a translucent one would need its backdrop to have a defined
 * luminance at all — which is the property the solid palette exists to restore.
 */
const oklchPattern = (/oklch\(\s*(?<lightness>[\d.]+)%\s+(?<chroma>[\d.]+)\s+(?<hue>[\d.]+)/u);

/**
 * Matches one custom-property declaration inside a theme block.
 */
const declarationPattern = (/^\s*--(?<name>[\w-]+):\s*(?<value>.+);\s*$/u);

/**
 * luminance - WCAG relative luminance of an `oklch()` string.
 * @param {string} value The declaration value, e.g. `oklch(53% 0.21 255)`.
 * @returns {number} Relative luminance, 0-1.
 */
const luminance = (value) =>
{
    const found = oklchPattern.exec(value);

    if (found?.groups === undefined)
    {
        throw new Error(`not an oklch() value: ${ value }`);
    }

    const { lightness, chroma, hue } = found.groups;

    const linear = oklchToLinear(Number(lightness) / 100, Number(chroma), Number(hue));

    return 0.2126 * linear.r + 0.7152 * linear.g + 0.0722 * linear.b;
};

/**
 * ratio - WCAG contrast between two token values.
 * @param {string} first One `oklch()` value.
 * @param {string} second The other.
 * @returns {number} The ratio, always >= 1.
 */
const ratio = (first, second) =>
{
    const a = luminance(first);
    const b = luminance(second);

    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

/**
 * readTheme - Pulls every custom property out of one `[data-theme]` block.
 * @param {string} sheet The whole stylesheet.
 * @param {string} name Theme name, `light` or `dark`.
 * @returns {Record<string, string>} Property name, without the leading dashes, to value.
 */
const readTheme = (sheet, name) =>
{
    const block = new RegExp(`\\[data-theme='${ name }'\\]\\s*\\{(?<body>[^}]*)\\}`, 'u').exec(sheet);

    if (block?.groups === undefined)
    {
        throw new Error(`no [data-theme='${ name }'] block found`);
    }

    /** @type {Record<string, string>} */
    const map = {};

    for (const line of block.groups.body.split('\n'))
    {
        const declaration = declarationPattern.exec(line);

        if (declaration?.groups !== undefined)
        {
            map[declaration.groups.name] = declaration.groups.value;
        }
    }

    return map;
};

/**
 * Every surface a piece of body text can land on, checked against all four text colours — a caption,
 * an error line and a success line are all body text, and all three appear on all three surfaces.
 */
const surfaces =
[
    'base-1',
    'base-2',
    'base-3'
];

const inks =
[
    'txt-normal',
    'txt-muted',
    'txt-error',
    'txt-success'
];

/**
 * Fills that carry `--txt-reverse`, at every step the fill can reach. A hover state still holds the
 * label, so it has to clear the same bar the resting state does — which is what sets the resting
 * value, since the hover step has to have somewhere to go.
 */
const fills =
[
    'btn-primary',
    'btn-primary-hover',
    'btn-primary-active',
    'btn-danger',
    'btn-danger-hover',
    'btn-danger-active',
    'btn-secondary'
];

const sheet = readFileSync(new URL('../src/assets/style.css', import.meta.url), 'utf8');

/** @type {string[]} */
const failures = [];

/** @type {string[]} */
const checks = [];

for (const theme of [ 'light', 'dark' ])
{
    const token = readTheme(sheet, theme);

    /**
     * check - Records one pair, and remembers it when it failed.
     * @param {string} label What the pair is, for the report.
     * @param {string} first First token name.
     * @param {string} second Second token name.
     * @param {number} floor The ratio this pair has to clear.
     * @returns {void}
     */
    const check = (label, first, second, floor) =>
    {
        const value = ratio(token[first], token[second]);
        const line = `${ theme.padEnd(5) } ${ label.padEnd(38) } ${ value.toFixed(2).padStart(6) }  (>= ${ floor })`;

        checks.push(line);

        if (value < floor)
        {
            failures.push(line);
        }
    };

    for (const ink of inks)
    {
        for (const surface of surfaces)
        {
            check(`${ ink } on ${ surface }`, ink, surface, 4.5);
        }
    }

    for (const fill of fills)
    {
        check(`txt-reverse on ${ fill }`, 'txt-reverse', fill, 4.5);
    }

    // The control boundary, measured against the fill it encloses rather than against the page.
    check('line-control on input-bg', 'line-control', 'input-bg', 3);
    check('input-normal on input-bg', 'input-normal', 'input-bg', 3);
    check('input-error on input-bg', 'input-error', 'input-bg', 3);

    // The focus ring has to be findable on every surface a focusable control can sit on.
    for (const surface of surfaces)
    {
        check(`focus-ring on ${ surface }`, 'focus-ring', surface, 3);
    }

    // The badge is pinned across themes, so its own text has to work against it in both.
    check('badge-text on badge', 'badge-text', 'badge', 4.5);
}

process.stdout.write(`${ checks.join('\n') }\n`);

if (failures.length > 0)
{
    process.stderr.write(`\n${ failures.length } contrast failure(s):\n${ failures.join('\n') }\n`);

    process.exit(1);
}

process.stdout.write(`\nall ${ checks.length } pairs pass\n`);
