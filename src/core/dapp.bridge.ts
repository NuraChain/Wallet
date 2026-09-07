import { platform } from '../platform';

import { dappLog } from './dapp.log';

import { siteOrigin, type DappEnvelope, type DappReply } from './dapp';

export interface DappPage {
    label: string;
    origin: string;
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

export const emitDappEvent = (label: string, event: string, payload: unknown) => {
    platform.dapp.emit(label, JSON.stringify({ event, payload }));
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

// A link is logged by its scheme alone: what a foreign scheme carries in its query string is the
// page's business, and the log has no use for it.
const linkScheme = (url: string) => url.slice(0, Math.max(0, url.indexOf(':')));

export const startDappBridge = (handler: (envelope: DappEnvelope) => Promise<DappReply>, onLink?: DappLinkHandler) => {
    stopBridge?.();

    dappLog('Bridge', 'started');

    const accept = (envelope: DappEnvelope, respond: (reply: DappReply) => void) => {
        pages.set(envelope.label, envelope.origin);

        void handler(envelope).then(
            respond,

            (cause: unknown) => {
                respond({ id: envelope.id, error: { code: -32603, message: cause instanceof Error ? cause.message : String(cause) } });
            }
        );
    };

    const stop = platform.dapp.serve(
        (call) => {
            let parsed: unknown;

            try {
                parsed = JSON.parse(call.payload);
            } catch {
                call.respond({ id: '', error: { code: -32700, message: 'The request was not valid JSON' } });

                return;
            }

            const envelope = readEnvelope(parsed, call.label, call.origin);

            if (envelope === undefined) {
                call.respond({ id: '', error: { code: -32600, message: 'The request was not a valid provider call' } });

                return;
            }

            accept(envelope, call.respond);
        },

        (url) => {
            dappLog('Bridge', 'link offered by a page', { scheme: linkScheme(url) });

            onLink?.(url);
        }
    );

    stopBridge = () => {
        stop();

        stopBridge = undefined;
    };

    return stopBridge;
};
