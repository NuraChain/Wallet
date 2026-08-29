import { isOnline } from './connection';
import { nuraChainId } from './network';
import { httpRequest } from './request';
import { prune, readRaw, writeRaw } from './cache.store';

/**
 * USD prices, keyed by pricing id — a CoinGecko coin id, or a Nura market id (see `marketPrefix`).
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
export interface PriceRead {
    prices: PriceMap;
    at: number;
}

/**
 * What marks a pricing id as belonging to Nura's own market rather than to CoinGecko.
 *
 * The two sources answer in the same currency and are held in the same cache, so an id has to carry
 * which endpoint can resolve it. A prefix rather than a parallel list of ids: `readPrices` takes one
 * flat set from callers that neither know nor care where a price comes from, and this is what lets it
 * split that set without asking anyone.
 *
 * It is not a valid CoinGecko id — those are lowercase words and hyphens — so the two can never
 * collide.
 */
const marketPrefix = 'nura:';

/**
 * The id Nura Coin itself is priced under.
 *
 * The chain's native coin has no contract to name it by, and the market prices its wrapped form, so
 * this stands in for the address the other market ids are built from.
 */
const nativeMarketId = `${marketPrefix}native`;

/**
 * The symbol the market lists the wrapped native coin under.
 *
 * Wrapped and native are the same value by construction — the contract holds one coin per token — so
 * the wrapped row is what answers for `nativeMarketId`.
 */
const wrappedSymbol = 'WNURA';

/**
 * Pricing ids for the native coin of each known chain: CoinGecko's for the listed ones, Nura's market
 * id for its own.
 *
 * Custom networks have no id, so their coin simply counts as zero in the portfolio total instead of
 * guessing a price.
 */
const nativeIds: Record<number, string | undefined> = { 1: 'ethereum', 56: 'binancecoin', [nuraChainId]: nativeMarketId };

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
const nativeLogos: Record<number, string | undefined> = { [nuraChainId]: `${nuraAssets}/Nura.png` };

/**
 * Token logos Trust Wallet does not carry, by chain id and then by contract address.
 *
 * The addresses are lowercase and the lookup lowercases what it is given: call sites hand over the
 * checksummed address the token was stored with, and a table written in one casing and read in another
 * is a table that never matches.
 */
const tokenLogos: Record<number, Record<string, string | undefined> | undefined> = {
    [nuraChainId]: {
        '0xd4221ad9772bf5ba7423a044bbbee6af2154a5fc': `${nuraAssets}/BNB.svg`,
        '0x4e0db0b1da408faf5637202cf48b0bc7733be6dc': `${nuraAssets}/USDT.svg`
    }
};

const endpoint = 'https://api.coingecko.com/api/v3/simple/price';

/**
 * Where Nura's own prices come from.
 *
 * Nura Coin is on no listing service, so CoinGecko has nothing to say about it or about anything
 * bridged onto its chain — every Nura holding showed its amount and no second line, and the portfolio
 * total on that chain was permanently unknown. The chain's own automated market maker is the one place
 * a price for it exists at all: it publishes what its pools imply, in USD, for the native coin and for
 * every token it lists.
 *
 * This is the swap's read-only market endpoint rather than the pools themselves. Reading reserves
 * directly would mean knowing the factory, walking pairs and doing the constant-product arithmetic
 * here, all to arrive at the number this already states — and to risk stating it differently from the
 * site the user checks it against.
 */
const marketEndpoint = 'https://swap.nurachain.net/api/market/tokens';

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
interface StoredPrice {
    usd: number;
    at: number;
}

/** One row of the Nura market listing, of which only the address, the symbol and the price are read. */
interface MarketToken {
    address?: unknown;
    symbol?: unknown;
    priceUsd?: unknown;
}

/**
 * When each source was last asked, in memory only.
 *
 * The cache above holds answers, keyed per coin — so an id the endpoint has no price for leaves nothing
 * behind, and without this every mount would ask again on its behalf. That is the one thing worth
 * avoiding against a rate-limited public endpoint. This remembers the asking rather than the answer,
 * and it is deliberately not persisted: a fresh launch may always ask once.
 *
 * CoinGecko is keyed by the id set, since that is what its request says. The market is keyed by
 * `marketPrefix` alone, because its request says nothing — one call returns the whole chain.
 */
const asked = new Map<string, number>();

/**
 * getNativeCoinId - Pricing id for a chain's native coin.
 * @param {number} chainId The chain id.
 * @returns {string} The coin id, or an empty string when the chain is unknown.
 */
export const getNativeCoinId = (chainId: number) => nativeIds[chainId] ?? '';

/**
 * getTokenCoinId - Pricing id for one ERC20 holding.
 *
 * Everywhere but Nura this is the id the token was stored with, read off the built-in list when the
 * contract was added. On Nura it is derived from the address instead, and that is the point: the market
 * prices contracts rather than listed coins, so the id can be computed for a token that was added
 * before any of this existed — a stored `coinId` of `''` would otherwise have to be migrated on disk
 * before a single Nura holding could show a value.
 * @param {number} chainId The chain the token lives on.
 * @param {string} address The contract address.
 * @param {string} coinId The CoinGecko id the token was stored with.
 * @returns {string} The pricing id, or an empty string when the asset cannot be priced.
 */
export const getTokenCoinId = (chainId: number, address: string, coinId: string) =>
    chainId === nuraChainId ? `${marketPrefix}${address.toLowerCase()}` : coinId;

/**
 * getNativeLogo - Remote logo for a chain's native coin.
 *
 * A chain that publishes its own logo is answered from `nativeLogos` before Trust Wallet is consulted.
 * @param {number} chainId The chain id.
 * @returns {string} The logo URL, or an empty string when the chain is unknown.
 */
export const getNativeLogo = (chainId: number) => {
    const named = nativeLogos[chainId];

    if (named !== undefined) {
        return named;
    }

    const folder = assetFolders[chainId];

    return folder === undefined ? '' : `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${folder}/info/logo.png`;
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
export const getTokenLogo = (chainId: number, address: string) => {
    const named = tokenLogos[chainId]?.[address.toLowerCase()];

    if (named !== undefined) {
        return named;
    }

    const folder = assetFolders[chainId];

    return folder === undefined ? '' : `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${folder}/assets/${address}/logo.png`;
};

/**
 * parsePrice - Reads one stored price back, or `undefined` when it is not what was written.
 * @param {string | undefined} raw The serialized entry.
 * @returns {StoredPrice | undefined} The price, or `undefined`.
 */
const parsePrice = (raw: string | undefined) => {
    if (raw === undefined) {
        return undefined;
    }

    try {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(raw) as StoredPrice;

        if (typeof parsed.usd !== 'number' || !Number.isFinite(parsed.usd) || typeof parsed.at !== 'number') {
            return undefined;
        }

        return parsed;
    } catch {
        return undefined;
    }
};

/**
 * collect - Turns what is held into the answer a caller renders.
 * @param {Map<string, StoredPrice>} held The resolved prices.
 * @returns {PriceRead} The prices, stamped with the age of the oldest of them.
 */
const collect = (held: Map<string, StoredPrice>): PriceRead => {
    const prices: PriceMap = {};

    let at = 0;

    for (const [id, entry] of held) {
        prices[id] = entry.usd;

        // The oldest, because that is what the figure they add up to is worth: a total is only as
        // current as the stalest number inside it.
        at = at === 0 ? entry.at : Math.min(at, entry.at);
    }

    return { prices, at };
};

/**
 * keep - Files one resolved price: on disk always, and in this read when it was asked for.
 *
 * The two are not the same set. The market answers for the whole chain however little was asked of it,
 * and there is no reason to throw the rest away — but a caller's `at` has to describe the prices behind
 * *its* figure, so a price nobody asked for is stored for next time rather than folded into this
 * answer.
 * @param {Map<string, StoredPrice>} held The prices resolved for this read.
 * @param {Set<string>} wanted The ids this read was asked for.
 * @param {string} id The pricing id.
 * @param {number} usd The price.
 * @param {number} at When it was read.
 * @returns {void}
 */
const keep = (held: Map<string, StoredPrice>, wanted: Set<string>, id: string, usd: number, at: number) => {
    if (wanted.has(id)) {
        held.set(id, { usd, at });
    }

    writeRaw('local', pricePrefix + id, JSON.stringify({ usd, at }));
};

/**
 * readGecko - Resolves what CoinGecko can price, in one call.
 *
 * Nothing here throws or reports: an id the endpoint has no price for is simply never filed, and the
 * caller renders that holding without a second line.
 * @param {string[]} ids The CoinGecko coin ids to ask about.
 * @param {Map<string, StoredPrice>} held Where resolved prices are filed.
 * @param {Set<string>} wanted The ids this read was asked for.
 * @returns {Promise<void>} Resolves once the call has been made, or skipped.
 */
const readGecko = async (ids: string[], held: Map<string, StoredPrice>, wanted: Set<string>) => {
    const key = ids.join(',');

    if (Date.now() - (asked.get(key) ?? 0) < priceFresh) {
        return;
    }

    // Recorded before the request rather than after it, so two callers arriving together send one.
    asked.set(key, Date.now());

    try {
        // `httpRequest` rather than `fetch`: read natively, so a price stops depending on CoinGecko's
        // CORS header staying as it is — see [request.ts](request.ts).
        const response = await httpRequest(`${endpoint}?ids=${encodeURIComponent(key)}&vs_currencies=usd`);

        if (response.ok) {
            // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const parsed = (await response.json()) as Record<string, { usd?: unknown } | undefined>;

            const at = Date.now();

            for (const id of ids) {
                const entry = parsed[id];

                if (entry !== undefined && typeof entry.usd === 'number' && Number.isFinite(entry.usd)) {
                    keep(held, wanted, id, entry.usd, at);
                }
            }
        }
    } catch {
        // An unreachable endpoint leaves `held` exactly as it was, which is the point — and the record
        // of having asked is dropped, so the reconnect that follows retries at once instead of waiting
        // out a window meant for answers. A request the endpoint *did* answer badly keeps its record:
        // that one is a rate limit or an outage, and asking again immediately is what caused it.
        asked.delete(key);
    }
};

/**
 * readMarket - Resolves what Nura's own market prices, in one call.
 *
 * The endpoint takes no arguments and lists the whole chain, so the request is the same whether one
 * Nura asset was asked about or five. That is why the throttle is keyed on the source rather than on
 * the ids the way CoinGecko's is, and why every row is filed rather than only the wanted ones: a token
 * added a minute from now is then already priced.
 * @param {Map<string, StoredPrice>} held Where resolved prices are filed.
 * @param {Set<string>} wanted The ids this read was asked for.
 * @returns {Promise<void>} Resolves once the call has been made, or skipped.
 */
const readMarket = async (held: Map<string, StoredPrice>, wanted: Set<string>) => {
    if (Date.now() - (asked.get(marketPrefix) ?? 0) < priceFresh) {
        return;
    }

    asked.set(marketPrefix, Date.now());

    try {
        const response = await httpRequest(marketEndpoint);

        if (response.ok) {
            // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const parsed = (await response.json()) as MarketToken[];

            if (!Array.isArray(parsed)) {
                return;
            }

            const at = Date.now();

            for (const entry of parsed) {
                if (typeof entry?.address !== 'string' || typeof entry.priceUsd !== 'number' || !Number.isFinite(entry.priceUsd)) {
                    continue;
                }

                keep(held, wanted, `${marketPrefix}${entry.address.toLowerCase()}`, entry.priceUsd, at);

                // The wrapper's price is the coin's, so the same number is filed twice under two ids.
                // The alternative is for every caller holding the native coin to know which contract
                // wraps it, which is a fact about this chain and belongs here.
                if (entry.symbol === wrappedSymbol) {
                    keep(held, wanted, nativeMarketId, entry.priceUsd, at);
                }
            }
        }
    } catch {
        asked.delete(marketPrefix);
    }
};

/**
 * readPrices - USD prices for a set of pricing ids, from disk first and the endpoints second.
 *
 * Two sources answer here — CoinGecko for the listed coins, Nura's own market for everything on its
 * chain — and which one an id belongs to is written into the id itself, so callers hand over one flat
 * set and this splits it. They are asked in parallel and neither can fail the other: a source that is
 * down leaves its own assets unpriced while the rest still show a value.
 *
 * Held prices answer for a minute, so switching tabs or refreshing balances does not hammer the public
 * (rate-limited) endpoint. Past that the endpoint is asked — and if it cannot be reached, **what is
 * held answers anyway, at whatever age it is**. That is the difference between a wallet that shows an
 * hour-old valuation with a note on it and one that shows `$0.00` the moment the wifi drops.
 *
 * Nothing here throws. A price is a nicety on top of a balance, and there is no failure of it worth
 * propagating: an id that cannot be resolved is simply absent from the map, and the asset then shows
 * its amount with no second line rather than a fabricated one.
 * @param {string[]} ids Pricing ids, as `getNativeCoinId` and `getTokenCoinId` give them.
 * @returns {Promise<PriceRead>} The prices that could be resolved, and how old the oldest is.
 */
export const readPrices = async (ids: string[]): Promise<PriceRead> => {
    const unique = [...new Set(ids.filter((id) => id.length > 0))].sort((left, right) => left.localeCompare(right));

    // Nothing to price is not a failed lookup: a chain with no listed coin — every custom network —
    // has a knowable answer of "no prices", and it is current rather than missing.
    if (unique.length === 0) {
        return { prices: {}, at: Date.now() };
    }

    const wanted = new Set(unique);
    const held = new Map<string, StoredPrice>();

    for (const id of unique) {
        const entry = parsePrice(readRaw('local', pricePrefix + id));

        if (entry !== undefined) {
            held.set(id, entry);
        }
    }

    const due = unique.filter((id) => {
        const entry = held.get(id);

        return entry === undefined || Date.now() - entry.at > priceFresh;
    });

    // Skipped rather than attempted while the link is down: the request cannot succeed, and spending a
    // timeout to find that out only delays the held answer this returns either way.
    if (due.length === 0 || !isOnline()) {
        return collect(held);
    }

    const gecko = due.filter((id) => !id.startsWith(marketPrefix));

    await Promise.all([
        gecko.length > 0 ? readGecko(gecko, held, wanted) : Promise.resolve(),
        gecko.length < due.length ? readMarket(held, wanted) : Promise.resolve()
    ]);

    prune('local', pricePrefix, priceEntries, (raw) => parsePrice(raw)?.at ?? 0);

    return collect(held);
};
