import { platform } from '../platform';

import { dappLog } from './dapp.log';

import { siteOrigin } from './dapp';
import type { SiteDevice } from '../type/browser';
import type { DappEnvelope, DappLinkHandler, DappPage, DappReply } from '../type/dapp';

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

const isDevice = (kind: string): kind is SiteDevice => kind === 'microphone' || kind === 'camera';

const themeMethod = 'nura_themeColor';

const themeColor = /^#[0-9a-f]{6}$/iu;

/**
 * A page saying what colour it would have the browser around it wear. It comes over the provider's
 * rails because those are the rails a page has, but it is not a provider call: it is read here and
 * goes no further, so it needs no grant and is never routed.
 *
 * What is taken from it is a colour in one fixed shape, or word that the page has none. The page
 * can write anything it likes in that place, and whatever else it writes is `undefined`: answered
 * like the rest and otherwise dropped.
 */
const readTheme = (raw: unknown): { id: string; color: string | undefined } | undefined => {
    if (typeof raw !== 'object' || raw === null || !('method' in raw) || raw.method !== themeMethod) {
        return undefined;
    }

    const id = 'id' in raw && typeof raw.id === 'string' ? raw.id : '';

    const [value]: unknown[] = 'params' in raw && Array.isArray(raw.params) ? raw.params : [];

    if (value === null) {
        return { id, color: '' };
    }

    return { id, color: typeof value === 'string' && themeColor.test(value) ? value.toLowerCase() : undefined };
};

// A link is logged by its scheme alone: what a foreign scheme carries in its query string is the
// page's business, and the log has no use for it.
const linkScheme = (url: string) => url.slice(0, Math.max(0, url.indexOf(':')));

export const startDappBridge = (
    handler: (envelope: DappEnvelope) => Promise<DappReply>,
    onLink?: DappLinkHandler,
    onDevices?: (origin: string, wanted: SiteDevice[]) => Promise<boolean>,
    /** A page's colour for the wallet's chrome, by the page's label; the empty string for none. */
    onTheme?: (label: string, color: string) => void
) => {
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

            const theme = readTheme(parsed);

            if (theme !== undefined) {
                // Answered whatever it said: on desktop a call nobody answers is held open in Rust
                // for ten minutes, and a page can send as many of these as it likes.
                call.respond({ id: theme.id });

                if (theme.color !== undefined && siteOrigin(call.origin).length > 0) {
                    onTheme?.(call.label, theme.color);
                }

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
        },

        (ask) => {
            const origin = siteOrigin(ask.origin);

            const wanted = ask.kinds.filter(isDevice);

            dappLog('Bridge', 'devices asked for by a page', { origin, kinds: ask.kinds.join(',') });

            // One answer covers everything asked for, so a device the wallet does not know is a
            // refusal of the lot — as is an origin that is not a site, or nobody here to decide.
            if (origin.length === 0 || wanted.length === 0 || wanted.length !== ask.kinds.length || onDevices === undefined) {
                ask.respond(false);

                return;
            }

            void onDevices(origin, wanted).then(ask.respond, () => {
                ask.respond(false);
            });
        }
    );

    stopBridge = () => {
        stop();

        stopBridge = undefined;
    };

    return stopBridge;
};
