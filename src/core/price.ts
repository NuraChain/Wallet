import { isOnline } from './connection';
import { nuraChainId } from './network';
import { httpRequest } from './request';
import { prune, readRaw, writeRaw } from './cache.store';

/**
 * USD prices, keyed by CoinGecko coin id.
 */
export type PriceMap = Record<string, number>;

/**
 * What one lookup produced: the prices that could be resolved, and when the oldest of them was read.
 *
 * The moment matters as much as the number here. A price served from disk after a week offline is
 * still the most useful thing the app has, but a portfolio total drawn from it must be able to say so —
 * `at` is what lets the wallet tab mark the figure rather than present last week's valuation as today's.
 * It is `0` when nothing could be resolved at all, which is the caller's signal to show no figure
 * instead of a confident zero.
 */
export interface PriceRead { prices: PriceMap; at: number }

/**
 * CoinGecko coin ids for the native coin of each known chain. Custom networks have no id, so their coin simply counts as zero in the portfolio total instead of guessing a price.
 */
const nativeIds: Record<number, string | undefined> = { 1: 'ethereum', 56: 'binancecoin' };

/**
 * Trust Wallet asset folder per chain id, used to build logo URLs.
 */
const assetFolders: Record<number, string | undefined> = { 1: 'ethereum', 56: 'smartchain' };

/**
 * Nura's own asset repository, which is where the logos Trust Wallet has never heard of come from.
 *
 * The repository below is keyed by the chains and contracts *it* lists, and Nura is in neither — no
 * folder means no URL, so every Nura asset drew the lettered disc rather than a logo. A chain that is
 * not in someone else's index can still publish its own, and the two tables under this are read ahead
 * of the folder lookup for exactly that.
 *
 * These are served with `Access-Control-Allow-Origin: *` and an honest `image/*` type, which is what
 * the image cache needs to store the bytes; anything without it still shows, through the raw address
 * and the `img` tag, but is fetched again every time.
 */
const nuraAssets = 'https://raw.githubusercontent.com/NuraChain/Asset/refs/heads/main';

/**
 * Native coin logos Trust Wallet does not carry, by chain id.
 */
const nativeLogos: Record<number, string | undefined> = { [nuraChainId]: `${ nuraAssets }/Nura.png` };

/**
 * Token logos Trust Wallet does not carry, by chain id and then by contract address.
 *
 * The addresses are lowercase and the lookup lowercases what it is given: call sites hand over the
 * checksummed address the token was stored with, and a table written in one casing and read in another
 * is a table that never matches.
 */
const tokenLogos: Record<number, Record<string, string | undefined> | undefined> =
{
    [nuraChainId]:
    {
        '0xd4221ad9772bf5ba7423a044bbbee6af2154a5fc': `${ nuraAssets }/BNB.svg`,
        '0x4e0db0b1da408faf5637202cf48b0bc7733be6dc': `${ nuraAssets }/USDT.svg`
    }
};

const endpoint = 'https://api.coingecko.com/api/v3/simple/price';

/**
 * Where prices are held, and for how long they answer without going back to the endpoint.
 *
 * **Local** storage, and filed one coin at a time. Both halves are deliberate: a price outlives the
 * session that read it — a coin's worth an hour ago is a far better answer than no answer at all, and
 * it is the only answer available on a launch with no connection — and keying by coin rather than by
 * the set that was asked for means adding a token does not throw away the prices of the ones already
 * tracked. The whole set used to be one entry, so every change to the holdings list started from
 * nothing.
 */
const pricePrefix = 'price-cache/v1/';
const priceFresh = 60 * 1000;
const priceEntries = 64;

/** One coin's price as it is stored. */
interface StoredPrice { usd: number; at: number }

/**
 * When each id set was last asked about, in memory only.
 *
 * The cache above holds answers, keyed per coin — so an id the endpoint has no price for leaves nothing
 * behind, and without this every mount would ask again on its behalf. That is the one thing worth
 * avoiding against a rate-limited public endpoint. This remembers the asking rather than the answer,
 * and it is deliberately not persisted: a fresh launch may always ask once.
 */
const asked = new Map<string, number>();

/**
 * getNativeCoinId - CoinGecko id for a chain's native coin.
 * @param {number} chainId The chain id.
 * @returns {string} The coin id, or an empty string when the chain is unknown.
 */
export const getNativeCoinId = (chainId: number) => nativeIds[chainId] ?? '';

/**
 * getNativeLogo - Remote logo for a chain's native coin.
 *
 * A chain that publishes its own logo is answered from `nativeLogos` before Trust Wallet is consulted.
 * @param {number} chainId The chain id.
 * @returns {string} The logo URL, or an empty string when the chain is unknown.
 */
export const getNativeLogo = (chainId: number) =>
{
    const named = nativeLogos[chainId];

    if (named !== undefined)
    {
        return named;
    }

    const folder = assetFolders[chainId];

    return folder === undefined ? '' : `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${ folder }/info/logo.png`;
};

/**
 * getTokenLogo - Remote logo for an ERC20 contract.
 *
 * Trust Wallet's asset repository is keyed by checksummed contract address and needs no API key, so icons work on a fresh install with nothing to configure. A contract it does not know about simply 404s and the caller falls back to the lettered avatar.
 *
 * A contract named in `tokenLogos` is answered from there first, which is how a chain Trust Wallet does
 * not index gets icons at all.
 * @param {number} chainId The chain the token lives on.
 * @param {string} address The checksummed contract address.
 * @returns {string} The logo URL, or an empty string when the chain is unknown.
 */
export const getTokenLogo = (chainId: number, address: string) =>
{
    const named = tokenLogos[chainId]?.[address.toLowerCase()];

    if (named !== undefined)
    {
        return named;
    }

    const folder = assetFolders[chainId];

    return folder === undefined ? '' : `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${ folder }/assets/${ address }/logo.png`;
};

/**
 * parsePrice - Reads one stored price back, or `undefined` when it is not what was written.
 * @param {string | undefined} raw The serialized entry.
 * @returns {StoredPrice | undefined} The price, or `undefined`.
 */
const parsePrice = (raw: string | undefined) =>
{
    if (raw === undefined)
    {
        return undefined;
    }

    try
    {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(raw) as StoredPrice;

        if (typeof parsed.usd !== 'number' || !Number.isFinite(parsed.usd) || typeof parsed.at !== 'number')
        {
            return undefined;
        }

        return parsed;
    }
    catch
    {
        return undefined;
    }
};

/**
 * collect - Turns what is held into the answer a caller renders.
 * @param {Map<string, StoredPrice>} held The resolved prices.
 * @returns {PriceRead} The prices, stamped with the age of the oldest of them.
 */
const collect = (held: Map<string, StoredPrice>): PriceRead =>
{
    const prices: PriceMap = {};

    let at = 0;

    for (const [ id, entry ] of held)
    {
        prices[id] = entry.usd;

        // The oldest, because that is what the figure they add up to is worth: a total is only as
        // current as the stalest number inside it.
        at = at === 0 ? entry.at : Math.min(at, entry.at);
    }

    return { prices, at };
};

/**
 * readPrices - USD prices for a set of CoinGecko ids, from disk first and the endpoint second.
 *
 * Held prices answer for a minute, so switching tabs or refreshing balances does not hammer the public
 * (rate-limited) endpoint. Past that the endpoint is asked — and if it cannot be reached, **what is
 * held answers anyway, at whatever age it is**. That is the difference between a wallet that shows an
 * hour-old valuation with a note on it and one that shows `$0.00` the moment the wifi drops.
 *
 * Nothing here throws. A price is a nicety on top of a balance, and there is no failure of it worth
 * propagating: an id that cannot be resolved is simply absent from the map, and the asset then shows
 * its amount with no second line rather than a fabricated one.
 * @param {string[]} ids CoinGecko coin ids.
 * @returns {Promise<PriceRead>} The prices that could be resolved, and how old the oldest is.
 */
export const readPrices = async(ids: string[]): Promise<PriceRead> =>
{
    const unique = [ ...new Set(ids.filter((id) => id.length > 0)) ].sort((left, right) => left.localeCompare(right));

    // Nothing to price is not a failed lookup: a chain with no listed coin — every custom network, and
    // Nura — has a knowable answer of "no prices", and it is current rather than missing.
    if (unique.length === 0)
    {
        return { prices: {}, at: Date.now() };
    }

    const held = new Map<string, StoredPrice>();

    for (const id of unique)
    {
        const entry = parsePrice(readRaw('local', pricePrefix + id));

        if (entry !== undefined)
        {
            held.set(id, entry);
        }
    }

    const due = unique.some((id) =>
    {
        const entry = held.get(id);

        return entry === undefined || Date.now() - entry.at > priceFresh;
    });

    const key = unique.join(',');

    // Skipped rather than attempted while the link is down: the request cannot succeed, and spending a
    // timeout to find that out only delays the held answer this returns either way.
    if (!due || Date.now() - (asked.get(key) ?? 0) < priceFresh || !isOnline())
    {
        return collect(held);
    }

    // Recorded before the request rather than after it, so two callers arriving together send one.
    asked.set(key, Date.now());

    try
    {
        // `httpRequest` rather than `fetch`: this is a known API host, so it reads natively and a
        // price stops depending on CoinGecko's CORS header staying as it is — see [request.ts](request.ts).
        const response = await httpRequest(`${ endpoint }?ids=${ encodeURIComponent(key) }&vs_currencies=usd`);

        if (response.ok)
        {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const parsed = await response.json() as Record<string, { usd?: unknown } | undefined>;

            const at = Date.now();

            for (const id of unique)
            {
                const entry = parsed[id];

                if (entry !== undefined && typeof entry.usd === 'number' && Number.isFinite(entry.usd))
                {
                    held.set(id, { usd: entry.usd, at });

                    writeRaw('local', pricePrefix + id, JSON.stringify({ usd: entry.usd, at }));
                }
            }

            prune('local', pricePrefix, priceEntries, (raw) => parsePrice(raw)?.at ?? 0);
        }
    }
    catch
    {
        // An unreachable endpoint leaves `held` exactly as it was, which is the point — and the record
        // of having asked is dropped, so the reconnect that follows retries at once instead of waiting
        // out a window meant for answers. A request the endpoint *did* answer badly keeps its record:
        // that one is a rate limit or an outage, and asking again immediately is what caused it.
        asked.delete(key);
    }

    return collect(held);
};
