import { cacheLog, clearUnder, prune, readRaw, writeRaw } from './cache.store';

import type { Token, TokenBalance } from './token';

const tokenCacheConfig = {
    balances: 30 * 1000,

    discovery: 10 * 60 * 1000,

    entries: 32
};

const balancePrefix = 'token-cache/v1/balances/';
const nativePrefix = 'token-cache/v1/native/';
const sweepPrefix = 'token-cache/v1/sweep/';

const lastBalancePrefix = 'token-cache/v1/last-balances/';
const lastNativePrefix = 'token-cache/v1/last-native/';

interface StoredBalance {
    address: string;
    value: string;
    formatted: string;
}

interface StoredBalances {
    tokens: StoredBalance[];
    written: number;
}

interface StoredNative {
    value: string;
    written: number;
}

const stamp = (raw: string) => {
    try {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(raw) as { written?: unknown };

        return typeof parsed.written === 'number' ? parsed.written : 0;
    } catch {
        return 0;
    }
};

export const balanceKey = (address: string, networkId: string, tokens: Token[]) =>
    `${networkId}|${address.toLowerCase()}|${tokens
        .map((item) => item.address.toLowerCase())
        .sort()
        .join(',')}`;

const parseBalances = (raw: string | undefined, tokens: Token[]) => {
    if (raw === undefined) {
        return undefined;
    }

    try {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(raw) as StoredBalances;

        if (!Array.isArray(parsed.tokens) || typeof parsed.written !== 'number') {
            return undefined;
        }

        const byAddress = new Map(tokens.map((item) => [item.address.toLowerCase(), item]));

        const restored = parsed.tokens.flatMap((item): TokenBalance[] => {
            const token = typeof item.address === 'string' ? byAddress.get(item.address.toLowerCase()) : undefined;

            if (token === undefined || typeof item.value !== 'string' || !/^\d+$/u.test(item.value)) {
                return [];
            }

            return [{ token, value: BigInt(item.value), formatted: typeof item.formatted === 'string' ? item.formatted : '0' }];
        });

        return { tokens: restored, written: parsed.written };
    } catch {
        return undefined;
    }
};

const parseNative = (raw: string | undefined) => {
    if (raw === undefined) {
        return undefined;
    }

    try {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(raw) as StoredNative;

        if (typeof parsed.value !== 'string' || !/^\d+$/u.test(parsed.value) || typeof parsed.written !== 'number') {
            return undefined;
        }

        return { value: BigInt(parsed.value), written: parsed.written };
    } catch {
        return undefined;
    }
};

export const readBalances = (key: string, tokens: Token[]) => {
    const entry = parseBalances(readRaw('session', balancePrefix + key), tokens);

    if (entry === undefined) {
        cacheLog('miss', key);

        return undefined;
    }

    const fresh = Date.now() - entry.written <= tokenCacheConfig.balances;

    cacheLog(fresh ? 'hit' : 'stale', key, `${entry.tokens.length} tokens`);

    return { ...entry, fresh };
};

export const readLastBalances = (key: string, tokens: Token[]) => parseBalances(readRaw('local', lastBalancePrefix + key), tokens);

export const writeBalances = (key: string, tokens: TokenBalance[]) => {
    const payload: StoredBalances = {
        tokens: tokens.map((item) => ({ address: item.token.address, value: item.value.toString(), formatted: item.formatted })),
        written: Date.now()
    };

    const serialized = JSON.stringify(payload);

    writeRaw('session', balancePrefix + key, serialized);
    writeRaw('local', lastBalancePrefix + key, serialized);

    prune('session', balancePrefix, tokenCacheConfig.entries, stamp);
    prune('local', lastBalancePrefix, tokenCacheConfig.entries, stamp);

    cacheLog('write', key, `${tokens.length} tokens`);
};

export const readNative = (key: string) => {
    const entry = parseNative(readRaw('session', nativePrefix + key));

    if (entry === undefined) {
        return undefined;
    }

    const fresh = Date.now() - entry.written <= tokenCacheConfig.balances;

    cacheLog(fresh ? 'hit native' : 'stale native', key);

    return { ...entry, fresh };
};

export const readLastNative = (key: string) => parseNative(readRaw('local', lastNativePrefix + key));

export const writeNative = (key: string, value: bigint) => {
    const payload: StoredNative = { value: value.toString(), written: Date.now() };

    const serialized = JSON.stringify(payload);

    writeRaw('session', nativePrefix + key, serialized);
    writeRaw('local', lastNativePrefix + key, serialized);

    prune('session', nativePrefix, tokenCacheConfig.entries, stamp);
    prune('local', lastNativePrefix, tokenCacheConfig.entries, stamp);
};

export const discoveryKey = (address: string, chainId: number) => `${chainId}|${address.toLowerCase()}`;

export const discoveryDue = (key: string) => {
    const raw = readRaw('local', sweepPrefix + key);

    const at = raw === undefined ? Number.NaN : Number(raw);

    const due = !Number.isFinite(at) || Date.now() - at > tokenCacheConfig.discovery;

    if (!due) {
        cacheLog('skip sweep', key);
    }

    return due;
};

export const markDiscovered = (key: string) => {
    writeRaw('local', sweepPrefix + key, String(Date.now()));

    prune('local', sweepPrefix, tokenCacheConfig.entries, (raw) => Number(raw) || 0);

    cacheLog('sweep done', key);
};

export const invalidateTokenCache = (match?: (key: string) => boolean) => {
    clearUnder('session', balancePrefix, match);
    clearUnder('session', nativePrefix, match);
    clearUnder('local', lastBalancePrefix, match);
    clearUnder('local', lastNativePrefix, match);
    clearUnder('local', sweepPrefix, match);
};
