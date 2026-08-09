/**
 * USD prices, keyed by CoinGecko coin id.
 */
export type PriceMap = Record<string, number>;

/**
 * CoinGecko coin ids for the native coin of each known chain. Custom networks have no id, so their coin simply counts as zero in the portfolio total instead of guessing a price.
 */
const nativeIds: Record<number, string | undefined> = { 1: 'ethereum', 56: 'binancecoin' };

/**
 * Trust Wallet asset folder per chain id, used to build logo URLs.
 */
const assetFolders: Record<number, string | undefined> = { 1: 'ethereum', 56: 'smartchain' };

const endpoint = 'https://api.coingecko.com/api/v3/simple/price';

const cache = new Map<string, { at: number; prices: PriceMap }>();

/**
 * getNativeCoinId - CoinGecko id for a chain's native coin.
 * @param {number} chainId The chain id.
 * @returns {string} The coin id, or an empty string when the chain is unknown.
 */
export const getNativeCoinId = (chainId: number) => nativeIds[chainId] ?? '';

/**
 * getNativeLogo - Remote logo for a chain's native coin.
 * @param {number} chainId The chain id.
 * @returns {string} The logo URL, or an empty string when the chain is unknown.
 */
export const getNativeLogo = (chainId: number) =>
{
    const folder = assetFolders[chainId];

    return folder === undefined ? '' : `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${ folder }/info/logo.png`;
};

/**
 * getTokenLogo - Remote logo for an ERC20 contract.
 *
 * Trust Wallet's asset repository is keyed by checksummed contract address and needs no API key, so icons work on a fresh install with nothing to configure. A contract it does not know about simply 404s and the caller falls back to the lettered avatar.
 * @param {number} chainId The chain the token lives on.
 * @param {string} address The checksummed contract address.
 * @returns {string} The logo URL, or an empty string when the chain is unknown.
 */
export const getTokenLogo = (chainId: number, address: string) =>
{
    const folder = assetFolders[chainId];

    return folder === undefined ? '' : `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${ folder }/assets/${ address }/logo.png`;
};

/**
 * readPrices - Fetches USD prices for a set of CoinGecko ids.
 *
 * Responses are cached for a minute against the exact id set, so switching tabs or refreshing balances does not hammer the public (rate-limited) endpoint. Malformed entries are dropped rather than thrown on — a missing price just leaves that asset out of the total.
 * @param {string[]} ids CoinGecko coin ids.
 * @returns {Promise<PriceMap>} The prices that could be resolved.
 */
export const readPrices = async(ids: string[]): Promise<PriceMap> =>
{
    const unique = [ ...new Set(ids.filter((id) => id.length > 0)) ].sort((left, right) => left.localeCompare(right));

    if (unique.length === 0)
    {
        return {};
    }

    const key = unique.join(',');
    const cached = cache.get(key);

    if (cached !== undefined && Date.now() - cached.at < 60000)
    {
        return cached.prices;
    }

    const response = await fetch(`${ endpoint }?ids=${ encodeURIComponent(key) }&vs_currencies=usd`);

    if (!response.ok)
    {
        throw new Error(`price lookup failed with ${ response.status }`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const parsed = await response.json() as Record<string, { usd?: unknown } | undefined>;

    const prices: PriceMap = {};

    for (const id of unique)
    {
        const entry = parsed[id];

        if (entry !== undefined && typeof entry.usd === 'number' && Number.isFinite(entry.usd))
        {
            prices[id] = entry.usd;
        }
    }

    cache.set(key, { at: Date.now(), prices });

    return prices;
};
