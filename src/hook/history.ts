import { formatUnits } from 'ethers';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useOnline } from './connection';
import { isOnline } from '../core/connection';
import { httpRequest } from '../core/request';
import { readRaw, writeRaw } from '../core/cache.store';
import { getExplorerApi, type Network } from '../core/network';
import { historyKey, readHistory, touchHistory, writeHistory, type Transaction } from '../core/history.cache';
import type { Token } from '../core/token';

export type { Transaction };

interface ExplorerRow {
    hash?: unknown;
    from?: unknown;
    to?: unknown;
    value?: unknown;
    timeStamp?: unknown;
    tokenSymbol?: unknown;
    tokenDecimal?: unknown;
}

const pageSize = 50;

interface ExplorerAnswer {
    items: Transaction[];
    notice: string;
}

const readAction = async (action: string, address: string, network: Network): Promise<ExplorerAnswer> => {
    const api = getExplorerApi(network);
    const query = `module=account&action=${action}&address=${encodeURIComponent(address)}&page=1&offset=${pageSize}&sort=desc`;

    const response = await httpRequest(`${api}${api.includes('?') ? '&' : '?'}${query}`);

    if (!response.ok) {
        return { items: [], notice: `explorer answered HTTP ${response.status}` };
    }

    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const parsed = (await response.json()) as { result?: unknown; message?: unknown };

    if (!Array.isArray(parsed.result)) {
        const reason = typeof parsed.result === 'string' && parsed.result.length > 0 ? parsed.result : '';

        const fallback = typeof parsed.message === 'string' && parsed.message.length > 0 ? parsed.message : 'explorer returned no transaction list';

        return { items: [], notice: reason.length > 0 ? reason : fallback };
    }

    const owner = address.toLowerCase();

    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const rows = parsed.result as ExplorerRow[];

    const items = rows.flatMap((row, index): Transaction[] => {
        if (typeof row.hash !== 'string' || typeof row.from !== 'string' || typeof row.value !== 'string') {
            return [];
        }

        const isToken = typeof row.tokenSymbol === 'string' && row.tokenSymbol.length > 0;

        if (!isToken && row.value === '0') {
            return [];
        }

        const to = typeof row.to === 'string' ? row.to : '';
        const decimals = typeof row.tokenDecimal === 'string' ? Number(row.tokenDecimal) : network.decimals;
        const symbol = isToken ? String(row.tokenSymbol) : network.symbol;

        return [
            {
                id: `${action}-${index}-${row.hash}`,
                hash: row.hash,
                from: row.from,
                to,
                value: formatUnits(row.value, Number.isInteger(decimals) ? decimals : 18),
                symbol,
                timestamp: typeof row.timeStamp === 'string' ? Number(row.timeStamp) : 0,
                incoming: to.toLowerCase() === owner
            }
        ];
    });

    return { items, notice: '' };
};

const covalentKey = import.meta.env.VITE_COVALENT_KEY ?? '';

const covalentBase = 'https://api.covalenthq.com/v1';

const covalentTokens = 4;

const notImplemented = 501;
const unsupportedKey = 'history/v1/unsupported/';
const unsupportedFor = 30 * 24 * 60 * 60 * 1000;

interface CovalentRow {
    tx_hash?: unknown;
    from_address?: unknown;
    to_address?: unknown;
    value?: unknown;
    block_signed_at?: unknown;
    transfers?: unknown;
}

interface CovalentTransfer {
    tx_hash?: unknown;
    from_address?: unknown;
    to_address?: unknown;
    delta?: unknown;
    block_signed_at?: unknown;
    contract_decimals?: unknown;
    contract_ticker_symbol?: unknown;
}

const covalentGet = async (chainId: number, path: string): Promise<unknown[]> => {
    try {
        const response = await httpRequest(`${covalentBase}/${chainId}${path}`, { headers: { Authorization: `Bearer ${covalentKey}` } });

        if (!response.ok) {
            if (response.status === notImplemented) {
                writeRaw('local', unsupportedKey + String(chainId), String(Date.now()));
            }

            return [];
        }

        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = (await response.json()) as { data?: { items?: unknown } };

        const items: unknown = parsed.data?.items;

        return Array.isArray(items) ? (items as unknown[]) : [];
    } catch {
        return [];
    }
};

const covalentSeconds = (value: unknown) => {
    if (typeof value !== 'string') {
        return 0;
    }

    const parsed = Date.parse(value);

    return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
};

const readCovalentNative = async (address: string, network: Network): Promise<Transaction[]> => {
    const items = await covalentGet(network.chainId, `/address/${encodeURIComponent(address)}/transactions_v3/?no-logs=true`);

    const owner = address.toLowerCase();

    return items.flatMap((raw, index): Transaction[] => {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const row = raw as CovalentRow;

        if (typeof row.tx_hash !== 'string' || typeof row.from_address !== 'string' || typeof row.value !== 'string') {
            return [];
        }

        const to = typeof row.to_address === 'string' ? row.to_address : '';

        if (row.value === '0' || (row.from_address.toLowerCase() !== owner && to.toLowerCase() !== owner)) {
            return [];
        }

        return [
            {
                id: `covalent-native-${index}-${row.tx_hash}`,
                hash: row.tx_hash,
                from: row.from_address,
                to,
                value: formatUnits(row.value, network.decimals),
                symbol: network.symbol,
                timestamp: covalentSeconds(row.block_signed_at),
                incoming: to.toLowerCase() === owner
            }
        ];
    });
};

const readCovalentToken = async (address: string, network: Network, token: Token): Promise<Transaction[]> => {
    const items = await covalentGet(
        network.chainId,
        `/address/${encodeURIComponent(address)}/transfers_v2/?contract-address=${encodeURIComponent(token.address)}`
    );

    const owner = address.toLowerCase();

    return items.flatMap((raw, index): Transaction[] => {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const row = raw as CovalentRow;

        if (!Array.isArray(row.transfers)) {
            return [];
        }

        return row.transfers.flatMap((entry, inner): Transaction[] => {
            // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const move = entry as CovalentTransfer;

            const rowHash = typeof row.tx_hash === 'string' ? row.tx_hash : '';
            const hash = typeof move.tx_hash === 'string' ? move.tx_hash : rowHash;

            if (hash.length === 0 || typeof move.delta !== 'string') {
                return [];
            }

            const from = typeof move.from_address === 'string' ? move.from_address : '';
            const to = typeof move.to_address === 'string' ? move.to_address : '';

            const decimals = typeof move.contract_decimals === 'number' ? move.contract_decimals : token.decimals;
            const ticker =
                typeof move.contract_ticker_symbol === 'string' && move.contract_ticker_symbol.length > 0 ? move.contract_ticker_symbol : token.symbol;

            return [
                {
                    id: `covalent-${token.address}-${index}-${inner}-${hash}`,
                    hash,
                    from,
                    to,
                    value: formatUnits(move.delta, decimals),
                    symbol: ticker,
                    timestamp: covalentSeconds(move.block_signed_at ?? row.block_signed_at),
                    incoming: to.toLowerCase() === owner
                }
            ];
        });
    });
};

const supportsChain = (chainId: number) => {
    const marked = Number(readRaw('local', unsupportedKey + String(chainId)) ?? '0');

    return !Number.isFinite(marked) || Date.now() - marked > unsupportedFor;
};

const readCovalent = async (address: string, network: Network, tokens: Token[]): Promise<Transaction[]> => {
    const reads = [readCovalentNative(address, network), ...tokens.slice(0, covalentTokens).map(async (token) => readCovalentToken(address, network, token))];

    const results = await Promise.all(reads.map(async (read) => read.catch((): Transaction[] => [])));

    return results.flat();
};

interface HistoryRead {
    sorted: Transaction[];
    reason: string;
}

const inflight = new Map<string, Promise<HistoryRead>>();

const load = async (key: string, address: string, network: Network, tokens: Token[], api: string): Promise<HistoryRead> => {
    const held = inflight.get(key);

    if (held !== undefined) {
        return held;
    }

    const request = (async (): Promise<HistoryRead> => {
        const answers =
            api.length === 0
                ? [{ items: [], notice: 'this network has no explorer API configured' }]
                : await Promise.all(
                      ['txlist', 'tokentx'].map(async (action) =>
                          readAction(action, address, network).catch((cause: unknown): ExplorerAnswer => ({
                              items: [],
                              notice: cause instanceof Error ? cause.message : String(cause)
                          }))
                      )
                  );

        const found = answers.flatMap((item) => item.items);

        const merged =
            found.length > 0 || !supportsChain(network.chainId) ? found : await readCovalent(address, network, tokens).catch((): Transaction[] => []);

        const sorted = merged.sort((left, right) => right.timestamp - left.timestamp);

        return { sorted, reason: sorted.length > 0 ? '' : (answers.map((item) => item.notice).find((text) => text.length > 0) ?? '') };
    })();

    inflight.set(key, request);

    try {
        return await request;
    } finally {
        inflight.delete(key);
    }
};

export const useHistory = (address: string, network: Network, tokens: Token[]) => {
    const [items, setItems] = useState<Transaction[]>([]);
    const [notice, setNotice] = useState('');
    const [loading, setLoading] = useState(true);
    const [nonce, setNonce] = useState(0);

    const online = useOnline();

    const lastNonce = useRef(nonce);

    const refresh = useCallback(() => {
        setNonce((current) => current + 1);
    }, []);

    const api = getExplorerApi(network);

    const tokenKey = tokens.map((item) => item.address).join(',');

    const key = historyKey(
        address,
        network.chainId,
        api,
        tokens.map((item) => item.address)
    );

    useEffect(() => {
        let active = true;

        const hit = readHistory(key);
        const forced = nonce !== lastNonce.current;

        lastNonce.current = nonce;

        if (hit !== undefined) {
            touchHistory(key);

            setItems(hit.entry.items.slice(0, pageSize));
            setNotice(hit.entry.notice);
            setLoading(false);

            if (hit.fresh && !forced) {
                return () => {
                    active = false;
                };
            }
        }

        const run = async () => {
            setLoading(hit === undefined);

            if (!isOnline()) {
                setLoading(false);

                return;
            }

            const { sorted, reason } = await load(key, address, network, tokens, api);

            if (!active) {
                return;
            }

            if (sorted.length === 0 && reason.length > 0 && hit !== undefined && hit.entry.items.length > 0) {
                setLoading(false);

                return;
            }

            const stored = writeHistory(key, sorted, reason);

            setNotice(reason);

            setItems(stored.slice(0, pageSize));
            setLoading(false);
        };

        void run();

        return () => {
            active = false;
        };
    }, [address, network.id, api, tokenKey, nonce, key, online]);

    return { items, loading, notice, refresh };
};
