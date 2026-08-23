import { getLanguage } from './language';

/**
 * Shorten an address to a `0x1234…abcd` form for compact display.
 *
 * Values that are too short to shorten are returned unchanged.
 * @param {string} address Full address.
 * @param {number} lead Leading characters to keep (including `0x`).
 * @param {number} tail Trailing characters to keep.
 * @returns {string} Shortened address.
 */
export const shortAddress = (address: string, lead = 6, tail = 4) =>
{
    if (address.length <= lead + tail)
    {
        return address;
    }

    return `${ address.slice(0, lead) }…${ address.slice(-tail) }`;
};

/**
 * Format a USD amount for display, always in `en-US` so the currency symbol and grouping stay stable across UI languages.
 *
 * Two decimals, except for a non-zero amount that would round away to none. A coin worth a fraction of
 * a cent is an ordinary thing to hold — Nura Coin is one — and at two places every balance of it reads
 * `$0.00`, which is the one rendering indistinguishable from holding nothing at all. Below a cent the
 * figure keeps enough places to be a number rather than a rounding artefact.
 * @param {number} value Amount in USD.
 * @returns {string} Formatted amount, e.g. `$2,000.00` or `$0.000277`.
 */
export const formatUsd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: value !== 0 && Math.abs(value) < 0.01 ? 6 : 2 }).format(value);

/**
 * Format a unix timestamp as a short calendar date in the active UI language.
 *
 * Unlike `formatUsd` this follows the user's language rather than a fixed locale, so a Persian UI reads dates on the Persian calendar. A missing or zero timestamp renders as an empty string.
 * @param {number} timestamp Seconds since the unix epoch.
 * @returns {string} Localized short date, or an empty string.
 */
export const formatDate = (timestamp: number) =>
{
    if (!Number.isFinite(timestamp) || timestamp <= 0)
    {
        return '';
    }

    return new Intl.DateTimeFormat(getLanguage().code, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(timestamp * 1000));
};

/**
 * The units an age is expressed in, each paired with how many of it make the next one up.
 *
 * Walked from the smallest: while the amount still fits inside the current unit it is reported in that
 * unit, otherwise it is divided down and the walk moves on. It stops at days, and days then run on past
 * a week — "12 days ago" is as clear as "2 weeks ago" and needs neither the extra rows nor the
 * approximation that a month is 4.35 weeks.
 */
const ageUnits: { unit: Intl.RelativeTimeFormatUnit; size: number }[] =
[
    { unit: 'second', size: 60 },
    { unit: 'minute', size: 60 },
    { unit: 'hour', size: 24 },
    { unit: 'day', size: Number.POSITIVE_INFINITY }
];

/**
 * Say how long ago a moment was, in the active UI language.
 *
 * This exists for figures that are being shown while they cannot be refreshed — a balance held from
 * before the connection went, most of all. A number with no age on it reads as current, which is the
 * one thing a cached balance must never do; "last updated 20 minutes ago" is the difference between
 * information and a lie.
 * @param {number} at Milliseconds since the unix epoch, as `Date.now()` reports them.
 * @returns {string} A localized relative time, or an empty string when there is no moment to describe.
 */
export const formatAge = (at: number) =>
{
    if (!Number.isFinite(at) || at <= 0)
    {
        return '';
    }

    // Clamped at zero: a clock that moved backwards between the write and this read would otherwise
    // put a cached value in the future.
    let amount = Math.max(0, Math.round((Date.now() - at) / 1000));

    for (const step of ageUnits)
    {
        if (amount < step.size)
        {
            return new Intl.RelativeTimeFormat(getLanguage().code, { numeric: 'auto' }).format(-amount, step.unit);
        }

        amount = Math.round(amount / step.size);
    }

    return '';
};

/**
 * Trim a decimal string to at most `max` fraction digits without rounding, dropping trailing zeros.
 *
 * Used for display only — never for amounts that get parsed back into wei.
 * @param {string} amount Decimal amount as a string.
 * @param {number} max Maximum fraction digits to keep.
 * @returns {string} Trimmed amount.
 */
export const trimAmount = (amount: string, max = 6) =>
{
    if (!amount.includes('.'))
    {
        return amount;
    }

    const [ whole, fraction ] = amount.split('.');
    const cut = fraction.slice(0, max).replace(/0+$/, '');

    return cut.length > 0 ? `${ whole }.${ cut }` : whole;
};
