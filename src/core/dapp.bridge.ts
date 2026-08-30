import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { getNativeBrowser } from './browser';

import { siteOrigin, type DappEnvelope, type DappReply } from './dapp';

export interface DappPage {
    label: string;
    origin: string;
}

declare global {
    interface Window {
        __nuraDappRequest?: (payload: string) => void;
    }
}

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

export const startDappBridge = (handler: (envelope: DappEnvelope) => Promise<DappReply>) => {
    stopBridge?.();

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

        stopBridge = () => {
            window.__nuraDappRequest = undefined;

            stopBridge = undefined;
        };

        return stopBridge;
    }

    let dropped = false;
    let unlisten: (() => void) | undefined;

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
    }).then(
        (stop) => {
            if (dropped) {
                stop();

                return;
            }

            unlisten = stop;
        },
        () => undefined
    );

    stopBridge = () => {
        dropped = true;

        unlisten?.();

        stopBridge = undefined;
    };

    return stopBridge;
};
