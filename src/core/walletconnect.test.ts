import { describe, expect, it, vi } from 'vitest';

/**
 * The WalletConnect client as the rest of the wallet meets it. A live pairing needs a relay and a
 * project id, so what is pinned down here is everything around that: which links are recognised,
 * what a build without a project id says instead of hanging, and that a page inside the browser
 * can reach the client through the provider router at all.
 */

const held = new Map<string, string>();

vi.mock('@tauri-apps/plugin-store', () => ({
    load: async () => ({
        get: async (key: string) => held.get(key),
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

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: async () => ({ ok: false, json: async () => ({}) }) }));

const { answerDapp, setDappAccount } = await import('./dapp.rpc');

const { getWalletConnectSessions, getWalletConnectState, pairWalletConnect, startWalletConnect, walletConnectConfigured } = await import('./walletconnect');

const topic = 'a09b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b';

const uri = `wc:${topic}@2?relay-protocol=irn&symKey=7f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0`;

describe('a build with no project id', () => {
    it('says so rather than pretending to be ready', () => {
        expect(walletConnectConfigured()).toBe(false);
        expect(getWalletConnectState()).toBe('off');
        expect(getWalletConnectSessions()).toEqual([]);
    });

    it('turns a pairing down with a reason the sheet can show', async () => {
        await expect(pairWalletConnect(uri)).rejects.toThrow('project id');
    });
});

describe('what counts as a pairing', () => {
    it('turns down anything that is not one, before it needs a relay', async () => {
        await expect(pairWalletConnect('https://pancakeswap.finance')).rejects.toThrow('not a WalletConnect link');
        await expect(pairWalletConnect('')).rejects.toThrow('not a WalletConnect link');
    });

    it('names the version when a v1 QR turns up', async () => {
        const legacy = 'wc:8a5e5bdc-a0e4@1?bridge=https%3A%2F%2Fbridge.walletconnect.org&key=deadbeef';

        await expect(pairWalletConnect(legacy)).rejects.toThrow('v1');
    });
});

describe('the route a page inside the browser takes', () => {
    it('reaches the client through the provider router once the wallet is running', async () => {
        setDappAccount('0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 0);

        const stop = startWalletConnect();

        const reply = await answerDapp({
            id: 'test-1',
            label: 'nura-browser-1',
            origin: 'https://dapp.example',
            method: 'nura_walletConnect',
            params: [uri]
        });

        // It got as far as the client, which is as far as a build with no project id can go.
        expect(reply.error?.message).toContain('project id');

        stop();
    });
});
