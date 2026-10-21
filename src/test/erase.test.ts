import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StorageKey } from '../type/storage';

// Delete Wallet leaves nothing of the wallet on the device: not in storage, a cache, or memory.

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

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn(async (_command: string) => undefined) }));

vi.mock('@tauri-apps/api/core', () => ({ invoke }));

vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => undefined }));

vi.stubGlobal('window', { addEventListener: () => undefined });
vi.stubGlobal('document', { addEventListener: () => undefined });

const { eraseWallet, erasedKeys, takeErased } = await import('../core/erase');
const { getConnections, grantConnection, isConnected, loadConnections } = await import('../core/dapp');
const { addNetwork, getNetwork, getNetworks } = await import('../core/network');
const { getVault, lockSession, unlockSession } = await import('../core/session');
const { keysUnder, writeRaw } = await import('../core/cache.store');

/** A record, so a new key has to be added here too. */
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
    'Wallet.BackupReminder': '1760000000000',
    'Browser.View': 'desktop',
    'Browser.History': '[{"url":"https://dapp.example","time":1}]',
    'Browser.Favorites': '[{"id":"x","name":"X","url":"https://dapp.example"}]',
    'Browser.Connections': '["https://dapp.example"]'
};

const address = '0x9fb8678213295c11ffc544865fe0f1a18019d941';

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

    it('clears what the sites in its browser kept, on the desktop', async () => {
        invoke.mockClear();

        await eraseWallet();

        expect(invoke).toHaveBeenCalledWith('browser_clear');
    });

    it('clears what the sites in its browser kept, on Android', async () => {
        const clearData = vi.fn();

        vi.stubGlobal('window', { addEventListener: () => undefined, __nuraBrowser: { clearData } });

        invoke.mockClear();

        try {
            await eraseWallet();
        } finally {
            vi.stubGlobal('window', { addEventListener: () => undefined });
        }

        expect(clearData).toHaveBeenCalledOnce();

        expect(invoke).not.toHaveBeenCalledWith('browser_clear');
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
