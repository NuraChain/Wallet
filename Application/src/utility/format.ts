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
