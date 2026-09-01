import { formatUnits } from 'ethers';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useOnline } from './connection';
import { isOnline } from '../core/connection';
import { httpRequest } from '../core/request';
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

interface HistoryRead {
    sorted: Transaction[];
    reason: string;
}

const inflight = new Map<string, Promise<HistoryRead>>();

const load = async (key: string, address: string, network: Network, api: string): Promise<HistoryRead> => {
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

        const sorted = found.sort((left, right) => right.timestamp - left.timestamp);

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

            const { sorted, reason } = await load(key, address, network, api);

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
