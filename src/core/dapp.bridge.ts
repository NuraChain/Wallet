import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { dappLog } from './dapp.log';
import { getNativeBrowser } from './browser';

import { siteOrigin, type DappEnvelope, type DappReply } from './dapp';

export interface DappPage {
    label: string;
    origin: string;
}

declare global {
    interface Window {
        __nuraDappRequest?: (payload: string) => void;
        __nuraDappLink?: (url: string) => void;
    }
}

/**
 * A URL a page tried to open that its webview cannot load — the native layers cancel the
 * navigation and hand it here instead of leaving the page on a dead link.
 */
export type DappLinkHandler = (url: string) => void;

const pages = new Map<string, string>();

export const getDappPages = (): DappPage[] => [...pages].map(([label, origin]) => ({ label, origin }));

export const forgetDappPage = (label: string) => {
    pages.delete(label);
};

export const forgetDappPages = () => {
    pages.clear();
};

const onAndroid = () => getNativeBrowser() !== undefined;

type DappResponder = (reply: DappReply) => void;

const androidResponder =
    (label: string): DappResponder =>
    (reply) => {
        getNativeBrowser()?.dappReply?.(label, JSON.stringify(reply));
    };

const desktopResponder =
    (ticket: number): DappResponder =>
    (reply) => {
        void invoke('dapp_respond', { ticket, payload: JSON.stringify(reply) }).catch(() => undefined);
    };

export const emitDappEvent = (label: string, event: string, payload: unknown) => {
    const body = JSON.stringify({ event, payload });

    if (onAndroid()) {
        getNativeBrowser()?.dappEmit?.(label, body);

        return;
    }

    void invoke('dapp_emit', { label, payload: body }).catch(() => undefined);
};

let stopBridge: (() => void) | undefined;

const readEnvelope = (raw: unknown, label: string, origin: string): DappEnvelope | undefined => {
    if (typeof raw !== 'object' || raw === null || !('id' in raw) || !('method' in raw)) {
        return undefined;
    }

    const { id, method } = raw;

    if (typeof id !== 'string' || id.length === 0 || typeof method !== 'string' || method.length === 0) {
        return undefined;
    }

    const params = 'params' in raw ? raw.params : [];

    const list = Array.isArray(params) ? params : [params];

    return { id, label, origin: siteOrigin(origin), method, params: list };
};

// A link is logged by its scheme alone. A pairing carries its session key in the query string, and
// that key is the one thing between the wallet and the dApp that has to stay unread.
const linkScheme = (url: string) => url.slice(0, Math.max(0, url.indexOf(':')));

export const startDappBridge = (handler: (envelope: DappEnvelope) => Promise<DappReply>, onLink?: DappLinkHandler) => {
    stopBridge?.();

    dappLog('Bridge', 'started', { android: onAndroid() });

    const accept = (envelope: DappEnvelope, respond: DappResponder) => {
        pages.set(envelope.label, envelope.origin);

        void handler(envelope).then(
            respond,

            (cause: unknown) => {
                respond({ id: envelope.id, error: { code: -32603, message: cause instanceof Error ? cause.message : String(cause) } });
            }
        );
    };

    if (onAndroid()) {
        window.__nuraDappRequest = (incoming: string) => {
            let parsed: unknown;

            try {
                parsed = JSON.parse(incoming);
            } catch {
                return;
            }

            if (typeof parsed !== 'object' || parsed === null || !('label' in parsed) || !('origin' in parsed) || !('payload' in parsed)) {
                return;
            }

            const { label, origin, payload } = parsed;

            if (typeof label !== 'string' || typeof origin !== 'string' || typeof payload !== 'string') {
                return;
            }

            let call: unknown;

            try {
                call = JSON.parse(payload);
            } catch {
                return;
            }

            const envelope = readEnvelope(call, label, origin);

            if (envelope !== undefined) {
                accept(envelope, androidResponder(label));
            }
        };

        window.__nuraDappLink = (incoming: string) => {
            if (typeof incoming === 'string' && incoming.length > 0) {
                dappLog('Bridge', 'link offered by a page', { scheme: linkScheme(incoming) });

                onLink?.(incoming);
            }
        };

        stopBridge = () => {
            window.__nuraDappRequest = undefined;
            window.__nuraDappLink = undefined;

            stopBridge = undefined;
        };

        return stopBridge;
    }

    let dropped = false;

    const unlisten: (() => void)[] = [];

    const hold = (stop: () => void) => {
        if (dropped) {
            stop();

            return;
        }

        unlisten.push(stop);
    };

    // A subscription that never lands is the worst kind of failure here: Rust keeps answering the
    // page with a request nobody is listening for, and every call hangs until it times out. It
    // means a permission is missing, so it is said out loud rather than swallowed.
    const lost = (event: string) => (cause: unknown) => {
        // oxlint-disable-next-line no-console
        console.error('[bridge]', event, cause);
    };

    void listen<{ label: string; url: string }>('nura://dapp-link', (event) => {
        if (event.payload.url.length > 0) {
            dappLog('Bridge', 'link offered by a page', { label: event.payload.label, scheme: linkScheme(event.payload.url) });

            onLink?.(event.payload.url);
        }
    }).then(hold, lost('nura://dapp-link'));

    void listen<{ ticket: number; label: string; origin: string; payload: string }>('nura://dapp-request', (event) => {
        const { ticket, label, origin, payload } = event.payload;

        const respond = desktopResponder(ticket);

        let call: unknown;

        try {
            call = JSON.parse(payload);
        } catch {
            respond({ id: '', error: { code: -32700, message: 'The request was not valid JSON' } });

            return;
        }

        const envelope = readEnvelope(call, label, origin);

        if (envelope === undefined) {
            respond({ id: '', error: { code: -32600, message: 'The request was not a valid provider call' } });

            return;
        }

        accept(envelope, respond);
    }).then(hold, lost('nura://dapp-request'));

    stopBridge = () => {
        dropped = true;

        for (const stop of unlisten.splice(0)) {
            stop();
        }

        stopBridge = undefined;
    };

    return stopBridge;
};
