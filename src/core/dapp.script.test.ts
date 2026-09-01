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

const pairing = 'wc:a09b8c7d6e5f4a3b@2?relay-protocol=irn&symKey=deadbeef';

const boot = () => {
    const calls: { id: string; method: string; params: unknown[] }[] = [];

    const bus = new EventTarget();

    const clicks: ((event: unknown) => void)[] = [];

    let accounts: string[] = [];

    const opened = vi.fn(() => 'a window');

    const win: Record<string, unknown> = {
        crypto: globalThis.crypto,
        open: opened,

        addEventListener: (name: string, handler: EventListener) => {
            bus.addEventListener(name, handler);
        },

        removeEventListener: (name: string, handler: EventListener) => {
            bus.removeEventListener(name, handler);
        },

        dispatchEvent: (event: Event) => bus.dispatchEvent(event)
    };

    const doc = {
        addEventListener: (name: string, handler: (event: unknown) => void) => {
            if (name === 'click') {
                clicks.push(handler);
            }
        }
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

        if (method === 'nura_walletConnect') {
            return { result: null };
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
    const run = new Function('window', 'document', 'CustomEvent', 'Event', 'setTimeout', dappScript(dappIdentity(1020)));

    run(win, doc, CustomEvent, Event, setTimeout);

    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const provider = win.ethereum as Provider;

    const notify = (event: string, payload: unknown) => {
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const receive = win.__nuraWalletEvent as (payload: string) => void;

        receive(JSON.stringify({ event, payload }));
    };

    const click = (href: string, nested = false) => {
        const anchor = { nodeType: 1, tagName: 'A', getAttribute: (name: string) => (name === 'href' ? href : null), parentNode: null };

        const node = nested ? { nodeType: 1, tagName: 'SPAN', getAttribute: () => null, parentNode: anchor } : anchor;

        const event = { composedPath: () => [node], target: node, preventDefault: vi.fn(), stopPropagation: vi.fn() };

        for (const handler of clicks) {
            handler(event);
        }

        return event;
    };

    return { win, provider, calls, notify, click, opened, bus };
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

describe('WalletConnect links inside a page', () => {
    it('carries a pairing the page tried to open in a window', async () => {
        const { calls, win, opened } = boot();

        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const open = win.open as (target: string) => unknown;

        expect(open(pairing)).toBeNull();

        await Promise.resolve();

        expect(calls.at(-1)).toMatchObject({ method: 'nura_walletConnect', params: [pairing] });
        expect(opened).not.toHaveBeenCalled();
    });

    it('leaves an ordinary window alone', () => {
        const { calls, win, opened } = boot();

        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const open = win.open as (target: string) => unknown;

        expect(open('https://pancakeswap.finance')).toBe('a window');

        expect(calls).toHaveLength(0);
        expect(opened).toHaveBeenCalledWith('https://pancakeswap.finance');
    });

    it('carries a pairing the page offered as a link', () => {
        const { calls, click } = boot();

        const event = click(pairing);

        expect(calls.at(-1)).toMatchObject({ method: 'nura_walletConnect', params: [pairing] });
        expect(event.preventDefault).toHaveBeenCalled();
    });

    it('finds the link a click landed inside', () => {
        const { calls, click } = boot();

        click(pairing, true);

        expect(calls.at(-1)).toMatchObject({ method: 'nura_walletConnect' });
    });

    it('leaves an ordinary link alone', () => {
        const { calls, click } = boot();

        const event = click('https://nurachain.net');

        expect(calls).toHaveLength(0);
        expect(event.preventDefault).not.toHaveBeenCalled();
    });
});
