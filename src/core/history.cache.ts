import { cacheLog, clearUnder, prune, readRaw, writeRaw } from './cache.store';

export interface Transaction {
    id: string;
    hash: string;
    from: string;
    to: string;
    value: string;
    symbol: string;
    timestamp: number;
    incoming: boolean;
}

const cacheConfig = {
    history: 2 * 60 * 1000,

    stale: 24 * 60 * 60 * 1000,

    entries: 24
};

const prefix = 'tx-cache/v1/';

interface HistoryEntry {
    items: Transaction[];
    notice: string;
    written: number;
    used: number;
}

interface HistoryHit {
    entry: HistoryEntry;
    fresh: boolean;
}

export const historyKey = (address: string, chainId: number, api: string, tokens: string[]) =>
    `${chainId}|${address.toLowerCase()}|${api}|${[...tokens]
        .map((item) => item.toLowerCase())
        .sort()
        .join(',')}`;

const identity = (item: Transaction) => `${item.hash}|${item.symbol}|${item.from.toLowerCase()}|${item.to.toLowerCase()}|${item.value}`;

const mergeTransactions = (held: Transaction[], found: Transaction[]) => {
    const byIdentity = new Map<string, Transaction>();

    for (const item of held) {
        byIdentity.set(identity(item), item);
    }

    for (const item of found) {
        byIdentity.set(identity(item), item);
    }

    return [...byIdentity.values()].sort((left, right) => right.timestamp - left.timestamp);
};

const parse = (raw: string | undefined) => {
    if (raw === undefined) {
        return undefined;
    }

    try {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const entry = JSON.parse(raw) as HistoryEntry;

        if (!Array.isArray(entry.items) || typeof entry.written !== 'number') {
            return undefined;
        }

        return entry;
    } catch {
        return undefined;
    }
};

export const readHistory = (key: string): HistoryHit | undefined => {
    const entry = parse(readRaw('local', prefix + key));

    if (entry === undefined) {
        cacheLog('miss', key);

        return undefined;
    }

    const age = Date.now() - entry.written;

    cacheLog(age > cacheConfig.stale ? 'expired' : 'hit', key, `${entry.items.length} rows`);

    return { entry, fresh: age <= cacheConfig.history };
};

export const writeHistory = (key: string, items: Transaction[], notice: string) => {
    const held = parse(readRaw('local', prefix + key));

    const merged = held === undefined ? [...items].sort((left, right) => right.timestamp - left.timestamp) : mergeTransactions(held.items, items);

    const entry: HistoryEntry = { items: merged, notice, written: Date.now(), used: Date.now() };

    writeRaw('local', prefix + key, JSON.stringify(entry));

    prune('local', prefix, cacheConfig.entries, (raw) => parse(raw)?.used ?? 0);

    cacheLog('write', key, `${merged.length} rows`);

    return merged;
};

export const touchHistory = (key: string) => {
    const entry = parse(readRaw('local', prefix + key));

    if (entry !== undefined) {
        writeRaw('local', prefix + key, JSON.stringify({ ...entry, used: Date.now() }));
    }
};

export const invalidateHistory = (match?: (key: string) => boolean) => {
    clearUnder('local', prefix, match);
};
