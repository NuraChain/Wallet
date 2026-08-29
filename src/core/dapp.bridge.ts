import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { getNativeBrowser } from './browser';

import { siteOrigin, type DappEnvelope, type DappReply } from './dapp';

/**
 * What one page in the browser is currently showing, as far as the provider is concerned.
 *
 * The origin is kept beside the label because an event has to be addressed to a view while the
 * decision about whether to send it at all is made about a site. Nothing here is taken from a page:
 * every entry is written from an envelope, and the origin in an envelope was stamped natively.
 */
export interface DappPage {
    label: string;
    origin: string;
}

declare global {
    interface Window {
        /**
         * How the Android bridge hands a page's call to the wallet.
         *
         * A single well-known global, matching `__nuraBrowserState` beside it: Kotlin has one app
         * webview to call into and no way to hold a reference to anything in it.
         */
        __nuraDappRequest?: (payload: string) => void;
    }
}

/**
 * Every page the provider has heard from, keyed by the view it lives in.
 *
 * This is how an event finds its audience. A page that has never made a call is not in here and does
 * not need to be — it holds no provider state to correct, because it has never asked for any. An entry
 * is replaced rather than added to when a tab navigates, since one view shows one page at a time.
 */
const pages = new Map<string, string>();

/**
 * getDappPages - Every page the provider has answered, newest state per view.
 * @returns {DappPage[]} One entry per live view that has spoken to the wallet.
 */
export const getDappPages = (): DappPage[] => [...pages].map(([label, origin]) => ({ label, origin }));

/**
 * forgetDappPage - Drops a view, when its tab is closed.
 *
 * Without this the map would grow for the life of the session and events would be addressed to views
 * that no longer exist. Neither is harmful — an emit to a missing label is a no-op on both platforms —
 * but a list of every site a session has visited is exactly the record the browser's history clearing
 * exists to remove, and holding a second copy of it here would quietly defeat that.
 * @param {string} label The view label to forget.
 * @returns {void}
 */
export const forgetDappPage = (label: string) => {
    pages.delete(label);
};

/**
 * forgetDappPages - Drops every view.
 * @returns {void}
 */
export const forgetDappPages = () => {
    pages.clear();
};

/**
 * Whether this build is talking to the Android bridge rather than to Tauri.
 *
 * Read per call rather than once, because the bridge is installed on the app webview by
 * `MainActivity.onWebViewCreate` and this module can be imported before that has run.
 * @returns {boolean} True on Android.
 */
const onAndroid = () => getNativeBrowser() !== undefined;

/**
 * How one answer gets back to the page that asked, which is not the same journey on both platforms.
 *
 * Android has no reply channel of its own: the call arrived through a one-way `JavascriptInterface`,
 * so the answer is evaluated into the page and the script matches it against its own pending map by
 * the id it minted. Desktop had the page waiting on a Tauri command all along, so the answer resolves
 * that command and comes back as its return value — which is why it is addressed by the ticket Rust
 * issued rather than by the page's id. Two tabs are free to mint the same id; a ticket is unique.
 */
type DappResponder = (reply: DappReply) => void;

/**
 * Failures are swallowed on purpose. A reply lands on a view that may have navigated away, been
 * hidden or been closed between the call and the answer — the page that asked is simply not there any
 * more, and there is nobody left to tell.
 * @param {string} label The view the call came from.
 * @returns {DappResponder} Delivers an answer to that view.
 */
const androidResponder =
    (label: string): DappResponder =>
    (reply) => {
        getNativeBrowser()?.dappReply?.(label, JSON.stringify(reply));
    };

/**
 * @param {number} ticket The ticket Rust is holding the page's request open under.
 * @returns {DappResponder} Resolves that request.
 */
const desktopResponder =
    (ticket: number): DappResponder =>
    (reply) => {
        void invoke('dapp_respond', { ticket, payload: JSON.stringify(reply) }).catch(() => undefined);
    };

/**
 * emitDappEvent - Pushes provider state into one page.
 *
 * The caller decides who hears what, and that is not a detail: `accountsChanged` carries the account
 * address, so sending it to a view whose site holds no grant would hand the address to a site the user
 * never connected to. This function does as it is told; `dapp.rpc` is where the audience is chosen.
 * @param {string} label The view to notify.
 * @param {string} event The EIP-1193 event name.
 * @param {unknown} payload The event argument, in the shape that event carries.
 * @returns {void}
 */
export const emitDappEvent = (label: string, event: string, payload: unknown) => {
    const body = JSON.stringify({ event, payload });

    if (onAndroid()) {
        getNativeBrowser()?.dappEmit?.(label, body);

        return;
    }

    void invoke('dapp_emit', { label, payload: body }).catch(() => undefined);
};

/**
 * Undoes whatever `startDappBridge` registered, so a second start replaces the first cleanly.
 */
let stopBridge: (() => void) | undefined;

/**
 * readEnvelope - Turns whatever arrived off the wire into a call the router can trust to be shaped.
 *
 * Everything except `origin` and `label` came from a page, so nothing is assumed: a method that is not
 * a string, or params that are neither array nor object, is not a request this wallet will try to
 * interpret. `params` is normalized to an array here so every handler downstream can index it without
 * asking again — the object form EIP-1193 permits is passed through as a single-element array, which
 * is how the two methods that use it (`wallet_watchAsset`, and some `wallet_addEthereumChain` callers)
 * are already written to read it.
 * @param {unknown} raw The parsed payload.
 * @param {string} label The view it arrived from.
 * @param {string} origin The origin the native side stamped on it.
 * @returns {DappEnvelope | undefined} The envelope, or `undefined` when it is not usable.
 */
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

    // Reduced to an origin here even though both native sides already send one. It is idempotent —
    // the origin of an origin is itself — and it is the single guarantee that a grant is looked up
    // under the same string whichever platform produced it. The two sides normalize in different
    // languages against different APIs, and this is the one line that makes a difference between them
    // impossible rather than merely unlikely.
    return { id, label, origin: siteOrigin(origin), method, params: list };
};

/**
 * startDappBridge - Connects the wallet to whichever pages the browser is showing.
 *
 * One handler answers every call from every tab. The transport differs by platform and nothing above
 * this line has to know which: Android pushes a call into a global that Kotlin invokes on the app
 * webview, while desktop receives a Tauri event that Rust emitted from the command the page invoked,
 * and answers it through a second command that unblocks that command's reply.
 *
 * Returns its own teardown, and calling it again replaces the previous registration rather than
 * stacking a second one — the dashboard mounts this and React will run an effect twice in strict mode.
 * @param {(envelope: DappEnvelope) => Promise<DappReply>} handler Answers one call.
 * @returns {() => void} Stops listening.
 */
export const startDappBridge = (handler: (envelope: DappEnvelope) => Promise<DappReply>) => {
    stopBridge?.();

    const accept = (envelope: DappEnvelope, respond: DappResponder) => {
        pages.set(envelope.label, envelope.origin);

        void handler(envelope).then(
            respond,

            // The router is written not to reject, so this is the belt to its braces: a handler that
            // threw anyway would otherwise leave the page's promise pending for good, and a dApp
            // waiting on a request that never settles simply stops working with no error to show.
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

            // The page's own JSON is parsed here rather than in Kotlin, so the shape a page is allowed
            // to send is described in one language and checked in the same place on both platforms.
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

    // `listen` resolves to its own unlisten, and the registration is in flight until it does. A
    // teardown that runs first has to be remembered rather than ignored, or strict mode's
    // mount-unmount-mount leaves the first listener attached for the life of the window.
    let dropped = false;
    let unlisten: (() => void) | undefined;

    void listen<{ ticket: number; label: string; origin: string; payload: string }>('nura://dapp-request', (event) => {
        const { ticket, label, origin, payload } = event.payload;

        const respond = desktopResponder(ticket);

        let call: unknown;

        try {
            call = JSON.parse(payload);
        } catch {
            // Rust is holding the page's request open on this ticket, so even a payload that cannot
            // be read has to be answered — dropping it would hang the page until the timeout.
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
