import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DappEnvelope, DappReply } from './dapp';

/**
 * The bridge is the only door a web page has into the wallet, so what matters here is what it
 * refuses to carry: a page writes the request, but never its own origin and never the flag that
 * says an approval has already been given.
 */

vi.mock('@tauri-apps/api/core', () => ({ invoke: async () => undefined }));

vi.mock('@tauri-apps/plugin-store', () => ({
    load: async () => ({ get: async () => undefined, set: async () => undefined, delete: async () => undefined, save: async () => undefined })
}));

vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => undefined }));

const replies: { label: string; payload: string }[] = [];

const nativeBrowser = {
    open: () => undefined,
    setBounds: () => undefined,
    close: () => undefined,
    reload: () => undefined,
    back: () => undefined,
    forward: () => undefined,

    dappReply: (label: string, payload: string) => {
        replies.push({ label, payload });
    }
};

// The Android bridge is the one that can be exercised without a webview: it is reached through two
// callbacks the native layer sets on the window.
Object.assign(globalThis, { window: globalThis, __nuraBrowser: nativeBrowser });

const { forgetDappPages, getDappPages, startDappBridge } = await import('./dapp.bridge');

const send = (payload: unknown, origin = 'https://dapp.example', label = 'nura-browser-1') => {
    window.__nuraDappRequest?.(JSON.stringify({ label, origin, payload: JSON.stringify(payload) }));
};

const settled = async () => {
    await new Promise((resolve) => {
        setTimeout(resolve, 5);
    });
};

afterEach(() => {
    replies.length = 0;

    forgetDappPages();
});

describe('what a page may put in an envelope', () => {
    it('carries the request through and answers on the page it came from', async () => {
        const seen: DappEnvelope[] = [];

        const stop = startDappBridge(async (envelope): Promise<DappReply> => {
            seen.push(envelope);

            return { id: envelope.id, result: '0x3fc' };
        });

        send({ id: 'one', method: 'eth_chainId', params: [] });

        await settled();

        expect(seen[0]).toMatchObject({ id: 'one', method: 'eth_chainId', origin: 'https://dapp.example', label: 'nura-browser-1' });
        expect(replies[0]).toEqual({ label: 'nura-browser-1', payload: JSON.stringify({ id: 'one', result: '0x3fc' }) });

        expect(getDappPages()).toEqual([{ label: 'nura-browser-1', origin: 'https://dapp.example' }]);

        stop();
    });

    it('will not let a page claim an approval it never received', async () => {
        const seen: DappEnvelope[] = [];

        const stop = startDappBridge(async (envelope): Promise<DappReply> => {
            seen.push(envelope);

            return { id: envelope.id, result: null };
        });

        send({ id: 'two', method: 'personal_sign', params: ['0x68690a'], granted: true });

        await settled();

        // Only the wallet's own session handler may set that flag; an envelope built from a page's
        // request carries the fields the bridge writes, and nothing the page slipped in.
        expect(seen[0].granted).toBeUndefined();

        stop();
    });

    it('will not let a page claim somebody else’s origin', async () => {
        const seen: DappEnvelope[] = [];

        const stop = startDappBridge(async (envelope): Promise<DappReply> => {
            seen.push(envelope);

            return { id: envelope.id, result: null };
        });

        send({ id: 'three', method: 'eth_accounts', params: [], origin: 'https://bank.example', label: 'main' });

        await settled();

        expect(seen[0].origin).toBe('https://dapp.example');
        expect(seen[0].label).toBe('nura-browser-1');

        stop();
    });

    it('keeps a page origin only when it is a real web origin', async () => {
        const seen: DappEnvelope[] = [];

        const stop = startDappBridge(async (envelope): Promise<DappReply> => {
            seen.push(envelope);

            return { id: envelope.id, result: null };
        });

        send({ id: 'four', method: 'eth_accounts', params: [] }, 'file:///home/someone/page.html');

        await settled();

        // The router turns an empty origin down; a file page is not something the wallet serves.
        expect(seen[0].origin).toBe('');

        stop();
    });

    it('drops a request that is not one', async () => {
        const seen: DappEnvelope[] = [];

        const stop = startDappBridge(async (envelope): Promise<DappReply> => {
            seen.push(envelope);

            return { id: envelope.id, result: null };
        });

        send({ method: 'eth_chainId' });
        send({ id: 'five' });
        send('not an object');

        window.__nuraDappRequest?.('not json at all');

        await settled();

        expect(seen).toHaveLength(0);
        expect(replies).toHaveLength(0);

        stop();
    });
});

describe('links a page cannot open itself', () => {
    it('hands them to the wallet, and stops when the bridge stops', () => {
        const links: string[] = [];

        const stop = startDappBridge(
            async (envelope) => ({ id: envelope.id, result: null }),
            (url) => {
                links.push(url);
            }
        );

        window.__nuraDappLink?.('wc:topic@2?relay-protocol=irn&symKey=beef');

        expect(links).toEqual(['wc:topic@2?relay-protocol=irn&symKey=beef']);

        stop();

        expect(window.__nuraDappLink).toBeUndefined();
    });
});
