import { platform } from '../platform';

import { dappLog } from './dapp.log';

import { isWatchLabel } from './browser';
import { dappError, siteOrigin } from './dapp';
import type { SiteDevice } from '../type/browser';
import type { DappEnvelope, DappLinkHandler, DappPage, DappReply, SiteNotices } from '../type/dapp';

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

/** A theme colour is read here and never routed, so it needs no grant; anything malformed is `undefined`. */
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

const noticeMethod = 'nura_notify';

const noticeAsk = 'nura_notifyPermission';

/** A notification, or the question whether one may be shown: read here and never routed, like a theme colour. */
const readNotice = (raw: unknown): { id: string; ask: boolean; title?: string; body: string } | undefined => {
    if (typeof raw !== 'object' || raw === null || !('method' in raw) || (raw.method !== noticeMethod && raw.method !== noticeAsk)) {
        return undefined;
    }

    const id = 'id' in raw && typeof raw.id === 'string' ? raw.id : '';

    if (raw.method === noticeAsk) {
        return { id, ask: true, body: '' };
    }

    const [value]: unknown[] = 'params' in raw && Array.isArray(raw.params) ? raw.params : [];

    if (typeof value !== 'object' || value === null || !('title' in value) || typeof value.title !== 'string') {
        return { id, ask: false, body: '' };
    }

    return { id, ask: false, title: value.title, body: 'body' in value && typeof value.body === 'string' ? value.body : '' };
};

// Logged by scheme alone: what a foreign link carries in its query is the page's business.
const linkScheme = (url: string) => url.slice(0, Math.max(0, url.indexOf(':')));

export const startDappBridge = (
    handler: (envelope: DappEnvelope) => Promise<DappReply>,
    onLink?: DappLinkHandler,
    onDevices?: (origin: string, wanted: SiteDevice[]) => Promise<boolean>,
    onTheme?: (label: string, color: string) => void,
    notices?: SiteNotices
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
                // Always answered: on desktop an unanswered call is held open in Rust for ten minutes.
                call.respond({ id: theme.id });

                if (theme.color !== undefined && siteOrigin(call.origin).length > 0) {
                    onTheme?.(call.label, theme.color);
                }

                return;
            }

            const notice = readNotice(parsed);

            if (notice !== undefined) {
                const origin = siteOrigin(call.origin);

                dappLog('Bridge', notice.ask ? 'notification permission asked by a page' : 'notification from a page', { origin });

                // Always answered, as a theme colour is; `default` rather than `denied`, since the user may yet allow it.
                const answer = (allowed: boolean) => {
                    if (notice.ask) {
                        call.respond({ id: notice.id, result: allowed ? 'granted' : 'default' });
                    } else if (allowed) {
                        call.respond({ id: notice.id, result: null });
                    } else {
                        call.respond({ id: notice.id, error: { code: dappError.unauthorized, message: 'This site may not show notifications' } });
                    }
                };

                if (origin.length === 0 || notices === undefined || (!notice.ask && notice.title === undefined)) {
                    answer(false);

                    return;
                }

                void (notice.ask ? notices.allowed(origin) : notices.show(origin, notice.title ?? '', notice.body)).then(answer, () => {
                    answer(false);
                });

                return;
            }

            const envelope = readEnvelope(parsed, call.label, call.origin);

            if (envelope === undefined) {
                call.respond({ id: '', error: { code: -32600, message: 'The request was not a valid provider call' } });

                return;
            }

            accept(envelope, call.respond);
        },

        (url, label) => {
            dappLog('Bridge', 'link offered by a page', { scheme: linkScheme(url) });

            // A page kept out of sight may not open another app or the wallet's own screens.
            if (!isWatchLabel(label)) {
                onLink?.(url);
            }
        },

        (ask) => {
            const origin = siteOrigin(ask.origin);

            const wanted = ask.kinds.filter(isDevice);

            dappLog('Bridge', 'devices asked for by a page', { origin, kinds: ask.kinds.join(',') });

            // One answer covers every kind asked for, so an unknown device, a non-site origin, a page out of sight or nobody to
            // decide refuses the lot.
            if (origin.length === 0 || isWatchLabel(ask.label) || wanted.length === 0 || wanted.length !== ask.kinds.length || onDevices === undefined) {
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
