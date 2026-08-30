import { isOnline } from './connection';
import { nuraChainId } from './network';
import { httpRequest } from './request';
import { prune, readRaw, writeRaw } from './cache.store';

export type PriceMap = Record<string, number>;

export interface PriceRead {
    prices: PriceMap;
    at: number;
}

const marketPrefix = 'nura:';

const nativeMarketId = `${marketPrefix}native`;

const wrappedSymbol = 'WNURA';

const nativeIds: Record<number, string | undefined> = { 1: 'ethereum', 56: 'binancecoin', [nuraChainId]: nativeMarketId };

const assetFolders: Record<number, string | undefined> = { 1: 'ethereum', 56: 'smartchain' };

const nuraAssets = 'https://raw.githubusercontent.com/NuraChain/Asset/refs/heads/main';

const nativeLogos: Record<number, string | undefined> = { [nuraChainId]: `${nuraAssets}/Nura.png` };

const tokenLogos: Record<number, Record<string, string | undefined> | undefined> = {
    [nuraChainId]: {
        '0xd4221ad9772bf5ba7423a044bbbee6af2154a5fc': `${nuraAssets}/BNB.svg`,
        '0x4e0db0b1da408faf5637202cf48b0bc7733be6dc': `${nuraAssets}/USDT.svg`
    }
};

const endpoint = 'https://api.coingecko.com/api/v3/simple/price';

const marketEndpoint = 'https://swap.nurachain.net/api/market/tokens';

const pricePrefix = 'price-cache/v1/';
const priceFresh = 60 * 1000;
const priceEntries = 64;

interface StoredPrice {
    usd: number;
    at: number;
}

interface MarketToken {
    address?: unknown;
    symbol?: unknown;
    priceUsd?: unknown;
}

const asked = new Map<string, number>();

export const getNativeCoinId = (chainId: number) => nativeIds[chainId] ?? '';

export const getTokenCoinId = (chainId: number, address: string, coinId: string) =>
    chainId === nuraChainId ? `${marketPrefix}${address.toLowerCase()}` : coinId;

export const getNativeLogo = (chainId: number) => {
    const named = nativeLogos[chainId];

    if (named !== undefined) {
        return named;
    }

    const folder = assetFolders[chainId];

    return folder === undefined ? '' : `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${folder}/info/logo.png`;
};

export const getTokenLogo = (chainId: number, address: string, symbol = '') => {
    if (chainId === nuraChainId && symbol.toUpperCase() === wrappedSymbol) {
        return getNativeLogo(chainId);
    }

    const named = tokenLogos[chainId]?.[address.toLowerCase()];

    if (named !== undefined) {
        return named;
    }

    const folder = assetFolders[chainId];

    return folder === undefined ? '' : `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${folder}/assets/${address}/logo.png`;
};

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

const collect = (held: Map<string, StoredPrice>): PriceRead => {
    const prices: PriceMap = {};

    let at = 0;

    for (const [id, entry] of held) {
        prices[id] = entry.usd;

        at = at === 0 ? entry.at : Math.min(at, entry.at);
    }

    return { prices, at };
};

const keep = (held: Map<string, StoredPrice>, wanted: Set<string>, id: string, usd: number, at: number) => {
    if (wanted.has(id)) {
        held.set(id, { usd, at });
    }

    writeRaw('local', pricePrefix + id, JSON.stringify({ usd, at }));
};

const readGecko = async (ids: string[], held: Map<string, StoredPrice>, wanted: Set<string>) => {
    const key = ids.join(',');

    if (Date.now() - (asked.get(key) ?? 0) < priceFresh) {
        return;
    }

    asked.set(key, Date.now());

    try {
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
        asked.delete(key);
    }
};

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

                if (entry.symbol === wrappedSymbol) {
                    keep(held, wanted, nativeMarketId, entry.priceUsd, at);
                }
            }
        }
    } catch {
        asked.delete(marketPrefix);
    }
};

export const readPrices = async (ids: string[]): Promise<PriceRead> => {
    const unique = [...new Set(ids.filter((id) => id.length > 0))].sort((left, right) => left.localeCompare(right));

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
