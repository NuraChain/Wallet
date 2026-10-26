import { describe, expect, it, vi } from 'vitest';

import { dappIdentity, dappScript } from '../core/dapp.script';

// The injected ES5 provider reaches only `window` and `document`, so it runs here with both handed in.

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

describe('the page', () => {
    it('gets no wallet control drawn into it', () => {
        const source = dappScript(dappIdentity(1020));

        // The floating mouse is the wallet's own layer, out of the page's reach.
        expect(source).not.toContain('nura-grip');
        expect(source).not.toContain('nura_chrome');
    });
});

interface Meta {
    name?: string;
    content?: string;
    media?: string;
}

/** The reader leans on one thing about a real canvas: it takes `#rrggbb` and leaves its fill alone for anything else. */
const page = (metas: Meta[], options: { matching?: string[]; framed?: boolean; channel?: 'native' | 'extension'; arriving?: boolean } = {}) => {
    const told: unknown[] = [];
    const posted: unknown[] = [];
    const timers: (() => void)[] = [];

    const matching = new Set(options.matching);

    const bus = new EventTarget();
    const schemeBus = new EventTarget();

    let observed: (() => void) | undefined;

    const element = (meta: Meta) => ({
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        getAttribute: (key: string) => (meta as Record<string, string | undefined>)[key] ?? null
    });

    const list = metas.map((meta) => element(meta));

    let fill = '#000000';
    let dot = [0, 0, 0, 0];

    const context = {
        get fillStyle() {
            return fill;
        },

        set fillStyle(value: string) {
            if (/^#[0-9a-f]{6}$/iu.test(value)) {
                fill = value.toLowerCase();
            }
        },

        clearRect: () => {
            dot = [0, 0, 0, 0];
        },

        fillRect: () => {
            dot = [...[1, 3, 5].map((at) => Number.parseInt(fill.slice(at, at + 2), 16)), 255];
        },

        getImageData: () => ({ data: dot })
    };

    let arrived: (() => void) | undefined;

    const doc = {
        readyState: options.arriving === true ? 'loading' : 'complete',
        head: {},
        documentElement: {},
        createElement: () => ({ width: 0, height: 0, getContext: () => context }),
        getElementsByTagName: () => list,

        addEventListener: (name: string, handler: () => void) => {
            if (name === 'DOMContentLoaded') {
                arrived = handler;
            }
        }
    };

    const win: Record<string, unknown> = {
        crypto: globalThis.crypto,

        addEventListener: (name: string, handler: EventListener) => {
            bus.addEventListener(name, handler);
        },

        removeEventListener: () => undefined,

        dispatchEvent: (event: Event) => bus.dispatchEvent(event),

        matchMedia: (query: string) => ({
            matches: matching.has(query),

            addEventListener: (name: string, handler: EventListener) => {
                schemeBus.addEventListener(name, handler);
            }
        }),

        postMessage: (message: unknown) => {
            posted.push(message);
        },

        __nuraEthereum: {
            request: (raw: string) => {
                // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                const call = JSON.parse(raw) as { method: string; params: unknown[] };

                if (call.method === 'nura_themeColor') {
                    told.push(call.params[0]);
                }
            }
        }
    };

    win.top = options.framed === true ? {} : win;

    class Observer {
        constructor(callback: () => void) {
            observed = callback;
        }

        observe() {
            return this;
        }

        disconnect() {
            return this;
        }
    }

    const later = (task: () => void) => {
        timers.push(task);
    };

    // oxlint-disable-next-line no-new-func
    const run = new Function('window', 'document', 'CustomEvent', 'Event', 'setTimeout', 'MutationObserver', dappScript(dappIdentity(1020, options.channel)));

    run(win, doc, CustomEvent, Event, later, Observer);

    const settle = () => {
        for (const task of timers.splice(0)) {
            task();
        }
    };

    settle();

    return {
        told,
        posted,

        rewrite: (next: Meta[]) => {
            list.splice(0, list.length, ...next.map((meta) => element(meta)));

            observed?.();

            settle();
        },

        finish: () => {
            doc.readyState = 'interactive';

            arrived?.();

            settle();
        },

        turn: (next: string[]) => {
            matching.clear();

            for (const query of next) {
                matching.add(query);
            }

            schemeBus.dispatchEvent(new Event('change'));

            settle();
        }
    };
};

describe('the colour a page asks the browser around it to wear', () => {
    const dark = '(prefers-color-scheme: dark)';
    const light = '(prefers-color-scheme: light)';

    it('is read from the meta named theme-color and told to the wallet', () => {
        expect(page([{ name: 'theme-color', content: '#112233' }]).told).toEqual(['#112233']);
    });

    it('matches the name in any case, and sets aside the white space around the colour', () => {
        expect(page([{ name: 'Theme-Color', content: ' \n\t#AABBCC \f\r' }]).told).toEqual(['#aabbcc']);
    });

    it('takes the first one, in the order the page wrote them', () => {
        const metas = [
            { name: 'viewport', content: '#000001' },
            { name: 'theme-color', content: '#111111' },
            { name: 'theme-color', content: '#222222' }
        ];

        expect(page(metas).told).toEqual(['#111111']);
    });

    it('passes over one whose media does not apply, and follows the scheme when it turns', () => {
        const held = page(
            [
                { name: 'theme-color', content: '#000000', media: dark },
                { name: 'theme-color', content: '#ffffff', media: light }
            ],
            { matching: [light] }
        );

        expect(held.told).toEqual(['#ffffff']);

        held.turn([dark]);

        expect(held.told).toEqual(['#ffffff', '#000000']);
    });

    it('passes over one that names no colour, or has no content at all', () => {
        const metas = [
            { name: 'theme-color' },
            { name: 'theme-color', content: 'not a colour' },
            { name: 'theme-color', content: '' },
            { name: 'theme-color', content: '#445566' }
        ];

        expect(page(metas).told).toEqual(['#445566']);
    });

    it('says so when the page has none, so the colour of the page before it is not left on', () => {
        expect(page([]).told).toEqual([null]);
        expect(page([{ name: 'description', content: '#112233' }]).told).toEqual([null]);
    });

    it('speaks again only when the answer has changed', () => {
        const held = page([{ name: 'theme-color', content: '#112233' }]);

        held.rewrite([{ name: 'theme-color', content: '#112233' }]);
        held.rewrite([
            { name: 'theme-color', content: '#112233' },
            { name: 'theme-color', content: '#999999' }
        ]);

        expect(held.told).toEqual(['#112233']);

        held.rewrite([{ name: 'theme-color', content: '#445566' }]);
        held.rewrite([]);

        expect(held.told).toEqual(['#112233', '#445566', null]);
    });

    it('does not say "none" of a page still arriving, whose tag may lie past a script it is waiting on', () => {
        const held = page([], { arriving: true });

        // Something lands in the head, and the tag is not there yet.
        held.rewrite([{ name: 'viewport', content: 'width=device-width' }]);

        expect(held.told).toEqual([]);

        held.rewrite([
            { name: 'viewport', content: 'width=device-width' },
            { name: 'theme-color', content: '#6200ee' }
        ]);

        expect(held.told).toEqual(['#6200ee']);

        held.finish();

        expect(held.told).toEqual(['#6200ee']);
    });

    it('says "none" once the whole page is in and still has no tag', () => {
        const held = page([], { arriving: true });

        held.rewrite([{ name: 'viewport', content: 'width=device-width' }]);
        held.finish();

        expect(held.told).toEqual([null]);
    });

    it('is never asked of a frame inside the page', () => {
        expect(page([{ name: 'theme-color', content: '#112233' }], { framed: true }).told).toEqual([]);
    });

    it('is not read at all in an extension, which draws nothing around a page', () => {
        const held = page([{ name: 'theme-color', content: '#112233' }], { channel: 'extension' });

        expect(held.told).toEqual([]);
        expect(JSON.stringify(held.posted)).not.toContain('nura_themeColor');
    });
});

describe('the notifications a page asks the wallet to show', () => {
    interface Notice {
        addEventListener: (name: string, handler: () => void) => void;
    }

    type NoticeType = (new (title: string, options?: Record<string, unknown>) => Notice) & {
        permission: string;
        requestPermission: (callback?: (answer: string) => void) => Promise<string>;
    };

    const notices = (options: { allowed?: boolean; framed?: boolean; channel?: 'native' | 'extension' } = {}) => {
        const calls: { method: string; params: unknown[] }[] = [];
        const posted: unknown[] = [];

        const win: Record<string, unknown> = {
            crypto: globalThis.crypto,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => true,

            postMessage: (message: unknown) => {
                posted.push(message);
            },

            __nuraEthereum: {
                request: (raw: string) => {
                    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                    const call = JSON.parse(raw) as { id: string; method: string; params: unknown[] };

                    calls.push(call);

                    const allowed = options.allowed === true;

                    let reply: unknown = { id: call.id, error: { code: 4100, message: 'This site may not show notifications' } };

                    if (call.method === 'nura_notifyPermission') {
                        reply = { id: call.id, result: allowed ? 'granted' : 'default' };
                    } else if (allowed) {
                        reply = { id: call.id, result: null };
                    }

                    queueMicrotask(() => {
                        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                        (win.__nuraWalletReply as (payload: string) => void)(JSON.stringify(reply));
                    });
                }
            }
        };

        win.top = options.framed === true ? {} : win;

        // oxlint-disable-next-line no-new-func
        const run = new Function('window', 'CustomEvent', 'Event', 'setTimeout', dappScript(dappIdentity(1020, options.channel)));

        run(win, CustomEvent, Event, () => undefined);

        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        return { calls, posted, Notice: win.Notification as NoticeType | undefined };
    };

    const settled = async () => {
        await new Promise((resolve) => {
            setTimeout(resolve, 5);
        });
    };

    it('learns at once whether the wallet allows them, and says so through the permission', async () => {
        const allowed = notices({ allowed: true });

        expect(allowed.Notice?.permission).toBe('default');

        await settled();

        expect(allowed.calls.map((call) => call.method)).toEqual(['nura_notifyPermission']);
        expect(allowed.Notice?.permission).toBe('granted');

        const refused = notices();

        await expect(refused.Notice?.requestPermission()).resolves.toBe('default');
        expect(refused.Notice?.permission).toBe('default');
    });

    it('hands the answer to a legacy callback too', async () => {
        const { Notice } = notices({ allowed: true });

        const answer = vi.fn();

        await Notice?.requestPermission(answer);

        expect(answer).toHaveBeenCalledWith('granted');
    });

    it('sends the title and body, and nothing else, to the wallet', async () => {
        const { Notice, calls } = notices({ allowed: true });

        if (Notice === undefined) {
            throw new Error('no Notification');
        }

        const shown = vi.fn();

        const notice = new Notice('New message', { body: 'Hello', icon: 'https://tracker.example/pixel.png' });

        notice.addEventListener('show', shown);

        await settled();

        expect(calls.at(-1)).toMatchObject({ method: 'nura_notify', params: [{ title: 'New message', body: 'Hello' }] });
        expect(JSON.stringify(calls)).not.toContain('tracker.example');
        expect(shown).toHaveBeenCalledOnce();
    });

    it('tells the page when the wallet would not show it', async () => {
        const { Notice } = notices();

        if (Notice === undefined) {
            throw new Error('no Notification');
        }

        const failed = vi.fn();

        const notice = new Notice('New message');

        notice.addEventListener('error', failed);

        await settled();

        expect(failed).toHaveBeenCalledOnce();
    });

    it('is not offered to a frame, nor in an extension, where the browser has its own', async () => {
        const framed = notices({ framed: true });
        const extension = notices({ channel: 'extension' });

        await settled();

        expect(framed.Notice).toBeUndefined();
        expect(framed.calls).toEqual([]);
        expect(extension.Notice).toBeUndefined();
        expect(JSON.stringify(extension.posted)).not.toContain('nura_notify');
    });
});
