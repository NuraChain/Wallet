import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StorageKey } from '../type/storage';

/**
 * Settings → Delete wallet. What it promises the person deleting it is that nothing of the wallet
 * is left on the device — not in storage, not in a cache, and not in memory waiting to be handed
 * to the next wallet made here.
 *
 * The Tauri store is stood in for by a map, and the page globals the connectivity probe listens on
 * by inert ones, so nothing here touches disk, the network or a window.
 */

const held = new Map<string, string>();

let unreadable = false;

vi.mock('@tauri-apps/plugin-store', () => ({
    load: async () => ({
        get: async (key: string) => {
            if (unreadable) {
                throw new Error('store unreadable');
            }

            return held.get(key);
        },
        set: async (key: string, value: string) => {
            held.set(key, value);
        },
        delete: async (key: string) => {
            held.delete(key);
        },
        save: async () => undefined
    })
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: async () => undefined }));

vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => undefined }));

vi.stubGlobal('window', { addEventListener: () => undefined });
vi.stubGlobal('document', { addEventListener: () => undefined });

const { eraseWallet, erasedKeys, takeErased } = await import('./erase');
const { getConnections, grantConnection, isConnected, loadConnections } = await import('./dapp');
const { addNetwork, getNetwork, getNetworks } = await import('./network');
const { getVault, lockSession, unlockSession } = await import('./session');
const { keysUnder, writeRaw } = await import('./cache.store');

/** One value under every key the app persists. A record, so a new key has to be added here too. */
const everything: Record<StorageKey, string> = {
    'App.Language': 'fa',
    'App.Theme': 'dark',
    'App.Mouse': '0.6',
    'App.Network': 'custom-42161',
    'App.Networks': '[]',
    'Wallet.Mnemonic': '{"salt":"c2FsdA==","iv":"aXY=","cipher":"Y2lwaGVy","kdf":"argon2id"}',
    'Wallet.Password': 'f'.repeat(64),
    'Wallet.Name': 'Main',
    'Wallet.Accounts': '[{"name":"Main","emoji":"🦊"}]',
    'Wallet.Active': '0',
    'Wallet.Tokens': '{"1":[{"address":"0xdAC17F958D2ee523a2206206994597C13D831ec7","symbol":"USDT","decimals":6}]}',
    'Wallet.TokensHidden': '{"1":["0x0000000000000000000000000000000000000001"]}',
    'Browser.View': 'desktop',
    'Browser.History': '[{"url":"https://dapp.example","time":1}]',
    'Browser.Favorites': '[{"id":"x","name":"X","url":"https://dapp.example"}]',
    'Browser.Connections': '["https://dapp.example"]'
};

const address = '0x9fb8678213295c11ffc544865fe0f1a18019d941';

/** A key under each cache that names an address, a balance, a coin or a site. */
const caches: { area: 'local' | 'session'; key: string }[] = [
    { area: 'local', key: `tx-cache/v1/1|${address}|https://eth.blockscout.com/api|` },
    { area: 'session', key: `token-cache/v1/balances/ethereum|${address}|` },
    { area: 'session', key: `token-cache/v1/native/ethereum|${address}` },
    { area: 'local', key: `token-cache/v1/last-balances/ethereum|${address}|` },
    { area: 'local', key: `token-cache/v1/last-native/ethereum|${address}` },
    { area: 'local', key: `token-cache/v1/sweep/ethereum|${address}` },
    { area: 'local', key: 'price-cache/v1/ethereum' },
    { area: 'local', key: 'site-icon/v1/https://dapp.example' },
    { area: 'local', key: 'image-cache/v1/blocked/unknown/https://dapp.example/favicon.ico' }
];

beforeEach(async () => {
    unreadable = false;

    held.clear();

    lockSession();

    takeErased();

    for (const [key, value] of Object.entries(everything)) {
        held.set(key, value);
    }

    for (const { area, key } of caches) {
        writeRaw(area, key, '{"written":1}');
    }

    await loadConnections();
});

describe('deleting the wallet', () => {
    it('leaves nothing in storage but how the app looks', async () => {
        await eraseWallet();

        expect([...held.keys()].sort()).toEqual(['App.Language', 'App.Mouse', 'App.Theme']);

        expect(held.get('App.Language')).toBe('fa');
    });

    it('names every key it erases, and the secret ones above all', () => {
        expect(erasedKeys).toContain('Wallet.Mnemonic');
        expect(erasedKeys).toContain('Wallet.Password');
        expect(erasedKeys).not.toContain('App.Language');

        expect(erasedKeys).toHaveLength(Object.keys(everything).length - 3);
    });

    it('clears every cache that holds an address, a balance or a visited site', async () => {
        for (const { area, key } of caches) {
            expect(keysUnder(area, key)).toEqual([key]);
        }

        await eraseWallet();

        for (const { area, key } of caches) {
            expect(keysUnder(area, key)).toEqual([]);
        }
    });

    it('lets go of connected sites, so the next wallet is not handed to them', async () => {
        await grantConnection('https://other.example');

        expect(isConnected('https://dapp.example')).toBe(true);
        expect(isConnected('https://other.example')).toBe(true);

        await eraseWallet();

        expect(getConnections()).toEqual([]);

        // The dashboard of the next wallet made on this device reads them back as it opens.
        expect(await loadConnections()).toEqual([]);

        expect(isConnected('https://dapp.example')).toBe(false);
    });

    it('drops the networks it added and goes back to the built-in one', async () => {
        await addNetwork({
            name: 'Arbitrum One',
            chainId: 42_161,
            symbol: 'ETH',
            rpcUrl: 'https://arb1.arbitrum.io/rpc',
            explorerUrl: 'https://arbiscan.io',
            explorerKey: 'personal-api-key',
            decimals: 18
        });

        expect(getNetwork().custom).toBe(true);

        await eraseWallet();

        expect(getNetwork().id).toBe('nura');

        expect(getNetworks().some((item) => item.custom)).toBe(false);
    });

    it('locks the wallet and says so once, to the screen that follows', async () => {
        unlockSession({ kind: 'mnemonic', secret: 'test test test test test test test test test test test junk' });

        expect(takeErased()).toBe(false);

        await eraseWallet();

        expect(getVault()).toBeUndefined();

        expect(takeErased()).toBe(true);
        expect(takeErased()).toBe(false);
    });
});

describe('reading connections back', () => {
    it('keeps what is held when the store cannot be read, rather than calling it empty', async () => {
        expect(isConnected('https://dapp.example')).toBe(true);

        unreadable = true;

        expect(await loadConnections()).toEqual(['https://dapp.example']);
    });
});
