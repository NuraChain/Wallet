import { describe, expect, it, vi } from 'vitest';

import { dappIdentity, dappScript } from './dapp.script';

/**
 * The provider the browser injects is plain ES5 that reaches for `window` and `document` and
 * nothing else, so it can be run here with both handed in — the same script the webview gets,
 * answered by a stand-in for the wallet on the other side of the bridge.
 */

interface Provider {
    isNuraWallet: boolean;
    isMetaMask: boolean;
    chainId: string;
    networkVersion: string;
    selectedAddress: string | null;
    request: (args: unknown) => Promise<unknown>;
    send: (first: unknown, second?: unknown) => unknown;
    sendAsync: (payload: unknown, callback: (error: unknown, reply: unknown) => void) => void;
    isConnected: () => boolean;
    on: (name: string, handler: (payload: unknown) => void) => unknown;
    removeListener: (name: string, handler: (payload: unknown) => void) => unknown;
}

interface Announcement {
    info: { uuid: string; name: string; rdns: string };
    provider: Provider;
}

const address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const boot = () => {
    const calls: { id: string; method: string; params: unknown[] }[] = [];

    const bus = new EventTarget();

    let accounts: string[] = [];

    const win: Record<string, unknown> = {
        crypto: globalThis.crypto,

        addEventListener: (name: string, handler: EventListener) => {
            bus.addEventListener(name, handler);
        },

        removeEventListener: (name: string, handler: EventListener) => {
            bus.removeEventListener(name, handler);
        },

        dispatchEvent: (event: Event) => bus.dispatchEvent(event)
    };

    // The wallet, as far as the page can tell: the same answers dapp.rpc.ts gives, and nothing else.
    const answer = (method: string, params: unknown[]): { result?: unknown; error?: { code: number; message: string } } => {
        if (method === 'eth_chainId') {
            return { result: '0x3fc' };
        }

        if (method === 'net_version') {
            return { result: '1020' };
        }

        if (method === 'eth_accounts') {
            return { result: accounts };
        }

        if (method === 'eth_requestAccounts') {
            accounts = [address];

            return { result: accounts };
        }

        if (method === 'personal_sign') {
            return { result: `0xsigned:${String(params[0])}` };
        }

        return { error: { code: 4200, message: `Nura Wallet does not support ${method}` } };
    };

    const bridge = {
        request: (raw: string) => {
            // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const call = JSON.parse(raw) as { id: string; method: string; params: unknown[] };

            calls.push(call);

            const held = answer(call.method, call.params);

            queueMicrotask(() => {
                // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                const deliver = win.__nuraWalletReply as (payload: string) => void;

                deliver(JSON.stringify({ id: call.id, ...held }));
            });
        }
    };

    win.__nuraEthereum = bridge;

    // oxlint-disable-next-line no-new-func
    const run = new Function('window', 'CustomEvent', 'Event', 'setTimeout', dappScript(dappIdentity(1020)));

    run(win, CustomEvent, Event, setTimeout);

    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const provider = win.ethereum as Provider;

    const notify = (event: string, payload: unknown) => {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const receive = win.__nuraWalletEvent as (payload: string) => void;

        receive(JSON.stringify({ event, payload }));
    };

    return { win, provider, calls, notify, bus };
};

describe('the injected provider', () => {
    it('announces itself as a wallet a dApp can use', () => {
        const { win, provider } = boot();

        expect(provider.isNuraWallet).toBe(true);
        expect(provider.isMetaMask).toBe(true);
        expect(typeof provider.request).toBe('function');
        expect(win.trustwallet).toBe(provider);
        expect(win.okxwallet).toBe(provider);
        expect(win.coinbaseWalletExtension).toBe(provider);

        // Binance's SDK reads the provider off its own object rather than off window.ethereum.
        expect((win.binancew3w as { ethereum: Provider }).ethereum).toBe(provider);

        // The legacy Binance global stays unset: a page that finds it signs through bnbSign().
        expect(win.BinanceChain).toBeUndefined();
    });

    it('starts on the chain the wallet handed it', async () => {
        const { provider } = boot();

        expect(provider.chainId).toBe('0x3fc');
        expect(provider.networkVersion).toBe('1020');

        await expect(provider.request({ method: 'eth_chainId' })).resolves.toBe('0x3fc');
        await expect(provider.request({ method: 'net_version' })).resolves.toBe('1020');
    });

    it('carries a request to the wallet and the answer back', async () => {
        const { provider, calls } = boot();

        await expect(provider.request({ method: 'eth_accounts' })).resolves.toEqual([]);

        const accounts = await provider.request({ method: 'eth_requestAccounts' });

        expect(accounts).toEqual([address]);
        expect(provider.selectedAddress).toBe(address);

        expect(calls.map((call) => call.method)).toEqual(['eth_accounts', 'eth_requestAccounts']);
        expect(new Set(calls.map((call) => call.id)).size).toBe(2);
    });

    it('tells the page about the account it was just granted', async () => {
        const { provider } = boot();

        const moved = vi.fn();

        provider.on('accountsChanged', moved);

        await provider.request({ method: 'eth_requestAccounts' });

        expect(moved).toHaveBeenCalledWith([address]);
    });

    it('answers eth_accounts synchronously once it knows the account', async () => {
        const { provider } = boot();

        await provider.request({ method: 'eth_requestAccounts' });

        expect(provider.send({ id: 7, method: 'eth_accounts' })).toEqual({ id: 7, jsonrpc: '2.0', result: [address] });
    });

    it('signs through the wallet', async () => {
        const { provider } = boot();

        await expect(provider.request({ method: 'personal_sign', params: ['0x68690a', address] })).resolves.toBe('0xsigned:0x68690a');
    });

    it('hands back a refusal as a ProviderRpcError', async () => {
        const { provider } = boot();

        await expect(provider.request({ method: 'eth_sign', params: [] })).rejects.toMatchObject({ code: 4200, name: 'ProviderRpcError' });
    });

    it('turns down a malformed request without troubling the wallet', async () => {
        const { provider, calls } = boot();

        await expect(provider.request('eth_chainId')).rejects.toMatchObject({ code: -32600 });
        await expect(provider.request({ method: '' })).rejects.toMatchObject({ code: -32600 });

        expect(calls).toHaveLength(0);
    });

    it('follows the wallet onto another chain', () => {
        const { provider, notify } = boot();

        const moved = vi.fn();

        provider.on('chainChanged', moved);

        notify('chainChanged', '0x38');

        expect(provider.chainId).toBe('0x38');
        expect(provider.networkVersion).toBe('56');
        expect(moved).toHaveBeenCalledWith('0x38');
    });

    it('follows the wallet onto another account, and off it', () => {
        const { provider, notify } = boot();

        notify('accountsChanged', [address]);

        expect(provider.selectedAddress).toBe(address);

        notify('accountsChanged', []);

        expect(provider.selectedAddress).toBeNull();
    });

    it('reports the connection it is told about', () => {
        const { provider, notify } = boot();

        const gone = vi.fn();

        provider.on('disconnect', gone);

        notify('connect', {});

        expect(provider.isConnected()).toBe(true);

        notify('disconnect', {});

        expect(provider.isConnected()).toBe(false);
        expect(gone).toHaveBeenCalledWith(expect.objectContaining({ code: 4900 }));
    });

    it('answers every wallet row a dApp draws, each with its own id', () => {
        const { win, provider } = boot();

        const announced: Announcement[] = [];

        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const listen = win.addEventListener as (name: string, handler: (event: CustomEvent<Announcement>) => void) => void;

        listen('eip6963:announceProvider', (event) => {
            announced.push(event.detail);
        });

        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const fire = win.dispatchEvent as (event: Event) => boolean;

        fire(new CustomEvent('eip6963:requestProvider'));

        expect(announced.map((item) => item.info.rdns)).toEqual([
            'net.nurachain.wallet',
            'io.metamask',
            'com.trustwallet.app',
            'com.coinbase.wallet',
            'com.binance.wallet',
            'com.okex.wallet'
        ]);

        expect(announced.every((item) => item.provider === provider)).toBe(true);

        const ids = new Set(announced.map((item) => item.info.uuid));

        expect(ids.size).toBe(announced.length);

        // A second round announces the same rows, not new ones: a modal keys its list on the uuid.
        fire(new CustomEvent('eip6963:requestProvider'));

        expect(new Set(announced.map((item) => item.info.uuid)).size).toBe(ids.size);
    });
});
