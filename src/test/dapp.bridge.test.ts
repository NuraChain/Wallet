import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DappEnvelope, DappReply } from '../type/dapp';

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

const verdicts: { ticket: string; allowed: boolean }[] = [];

const nativeBrowser = {
    open: () => undefined,
    setBounds: () => undefined,
    close: () => undefined,
    reload: () => undefined,
    back: () => undefined,
    forward: () => undefined,

    dappReply: (label: string, payload: string) => {
        replies.push({ label, payload });
    },

    permissionReply: (ticket: string, allowed: boolean) => {
        verdicts.push({ ticket, allowed });
    }
};

// The Android bridge is the one that can be exercised without a webview: it is reached through two
// callbacks the native layer sets on the window.
Object.assign(globalThis, { window: globalThis, __nuraBrowser: nativeBrowser });

const { forgetDappPages, getDappPages, startDappBridge } = await import('../core/dapp.bridge');

const send = (payload: unknown, origin = 'https://dapp.example', label = 'nura-browser-1') => {
    window.__nuraDappRequest?.(JSON.stringify({ label, origin, payload: JSON.stringify(payload) }));
};

const settled = async () => {
    await new Promise((resolve) => {
        setTimeout(resolve, 5);
    });
};

/** A page asking for devices, the way the native layer hands it over: who, and what for. */
const wants = (kinds: unknown[], origin = 'https://voice.example', ticket = 'seven') =>
    window.__nuraPermission?.(JSON.stringify({ ticket, label: 'nura-browser-1', origin, kinds }));

afterEach(() => {
    replies.length = 0;
    verdicts.length = 0;

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

        // An envelope is built field by field from the request: it carries what the bridge writes,
        // and nothing the page slipped in alongside it.
        expect('granted' in seen[0]).toBe(false);

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

    it('answers a request that is not one rather than leaving the page waiting', async () => {
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

        // Nothing malformed reaches the router.
        expect(seen).toHaveLength(0);

        // The three that parsed as JSON but not as a call are each refused by name. The page has
        // a promise open on every one of them, and silence would hang it for good; only the
        // string that was not JSON at all is dropped, because nothing in it identifies a caller.
        expect(replies).toHaveLength(3);

        for (const reply of replies) {
            // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const parsed = JSON.parse(reply.payload) as DappReply;

            expect(parsed.error?.code).toBe(-32600);
        }

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

        window.__nuraDappLink?.('tg://resolve?domain=example');

        expect(links).toEqual(['tg://resolve?domain=example']);

        stop();

        expect(window.__nuraDappLink).toBeUndefined();
    });
});

describe('a page asking for a device', () => {
    const quiet = async (envelope: DappEnvelope): Promise<DappReply> => ({ id: envelope.id, result: null });

    it('is put to the wallet under the origin the transport gave, and answered by ticket', async () => {
        const asked: { origin: string; wanted: string[] }[] = [];

        const stop = startDappBridge(quiet, undefined, async (origin, wanted) => {
            asked.push({ origin, wanted });

            return true;
        });

        // Taken there and then: the native side refuses a request nobody says they took.
        expect(wants(['microphone', 'camera'])).toBe(true);

        await settled();

        expect(asked).toEqual([{ origin: 'https://voice.example', wanted: ['microphone', 'camera'] }]);
        expect(verdicts).toEqual([{ ticket: 'seven', allowed: true }]);

        stop();
    });

    it('is refused without a question when the page is not a site', async () => {
        const asked: string[] = [];

        const stop = startDappBridge(quiet, undefined, async (origin) => {
            asked.push(origin);

            return true;
        });

        wants(['microphone'], 'file:///home/someone/page.html');

        await settled();

        expect(asked).toHaveLength(0);
        expect(verdicts).toEqual([{ ticket: 'seven', allowed: false }]);

        stop();
    });

    it('is refused whole when any of what it wants is not a device the wallet knows', async () => {
        const asked: string[] = [];

        const stop = startDappBridge(quiet, undefined, async (origin) => {
            asked.push(origin);

            return true;
        });

        // One answer covers the lot, so the microphone cannot be let through beside the rest.
        wants(['microphone', 'midi']);

        await settled();

        expect(asked).toHaveLength(0);
        expect(verdicts).toEqual([{ ticket: 'seven', allowed: false }]);

        stop();
    });

    it('is refused when nobody answers for it, or the asking fails', async () => {
        const silent = startDappBridge(quiet);

        wants(['microphone'], 'https://voice.example', 'eight');

        await settled();

        silent();

        const broken = startDappBridge(quiet, undefined, async () => {
            throw new Error('nothing to ask with');
        });

        wants(['microphone'], 'https://voice.example', 'nine');

        await settled();

        expect(verdicts).toEqual([
            { ticket: 'eight', allowed: false },
            { ticket: 'nine', allowed: false }
        ]);

        broken();
    });

    it('is not taken at all once the bridge has stopped, or when it is not a request', () => {
        const stop = startDappBridge(quiet, undefined, async () => true);

        expect(window.__nuraPermission?.('not json at all')).toBe(false);
        expect(wants([])).toBe(false);
        expect(wants(['microphone', 7])).toBe(false);
        expect(window.__nuraPermission?.(JSON.stringify({ ticket: 7, label: 'nura-browser-1', origin: 'https://voice.example', kinds: ['microphone'] }))).toBe(
            false
        );

        stop();

        // No dashboard, no handler: the native side reads that as a refusal on the spot.
        expect(window.__nuraPermission).toBeUndefined();
    });
});

describe('a page naming the colour of the chrome around it', () => {
    const themed = () => {
        const routed: DappEnvelope[] = [];
        const worn: { label: string; color: string }[] = [];

        const stop = startDappBridge(
            async (envelope): Promise<DappReply> => {
                routed.push(envelope);

                return { id: envelope.id, result: null };
            },
            undefined,
            undefined,
            (label, color) => {
                worn.push({ label, color });
            }
        );

        return { routed, worn, stop };
    };

    it('is read here and goes no further: no route, no page on the list, and an answer all the same', async () => {
        const { routed, worn, stop } = themed();

        send({ id: 'theme-1', method: 'nura_themeColor', params: ['#1A73E8'] });

        await settled();

        expect(worn).toEqual([{ label: 'nura-browser-1', color: '#1a73e8' }]);
        expect(routed).toEqual([]);
        expect(getDappPages()).toEqual([]);

        // Unanswered, the call would be held open on desktop until it timed out.
        expect(replies).toEqual([{ label: 'nura-browser-1', payload: JSON.stringify({ id: 'theme-1' }) }]);

        stop();
    });

    it('takes word that the page has none', async () => {
        const { worn, stop } = themed();

        send({ id: 'theme-2', method: 'nura_themeColor', params: [null] });

        await settled();

        expect(worn).toEqual([{ label: 'nura-browser-1', color: '' }]);

        stop();
    });

    it('takes a colour in one shape only, and answers the rest without acting on them', async () => {
        const { routed, worn, stop } = themed();

        const offered: unknown[] = [
            'red',
            '#fff',
            '#12345g',
            '#1234567',
            'rgb(1, 2, 3)',
            '#112233; background: url(https://evil.example)',
            'url(javascript:alert(1))',
            '',
            7,
            { color: '#112233' },
            ['#112233']
        ];

        for (const value of offered) {
            send({ id: 'theme-3', method: 'nura_themeColor', params: [value] });
        }

        send({ id: 'theme-3', method: 'nura_themeColor' });
        send({ method: 'nura_themeColor', params: 'nothing like a list' });

        await settled();

        expect(worn).toEqual([]);
        expect(routed).toEqual([]);
        expect(replies).toHaveLength(offered.length + 2);

        stop();
    });

    it('is not taken from a page that is not a site', async () => {
        const { worn, stop } = themed();

        send({ id: 'theme-4', method: 'nura_themeColor', params: ['#112233'] }, 'file://');
        send({ id: 'theme-5', method: 'nura_themeColor', params: ['#112233'] }, 'null');

        await settled();

        expect(worn).toEqual([]);
        expect(replies).toHaveLength(2);

        stop();
    });

    it('is told to nobody when nobody asked to hear it', async () => {
        const stop = startDappBridge(async (envelope): Promise<DappReply> => ({ id: envelope.id, result: null }));

        send({ id: 'theme-6', method: 'nura_themeColor', params: ['#112233'] });

        await settled();

        expect(replies).toEqual([{ label: 'nura-browser-1', payload: JSON.stringify({ id: 'theme-6' }) }]);

        stop();
    });
});
