import { dockChannel, isPageMessage, providerChannel, type DockMessage, type WorkerMessage } from './message';

/**
 * The isolated half of the bridge. It holds nothing and decides nothing: the page cannot be
 * trusted to say who it is, so the origin is never read here — the worker takes it off
 * `port.sender`, which only the browser can write.
 */

// On Chrome the manifest injects the provider into the main world itself and it leaves this
// attribute behind. Everywhere else — Firefox below 128, Safari below 18 — the script tag is the
// only way in, and it has to be synchronous to beat a page that reads window.ethereum in <head>.
if (document.documentElement.dataset.nuraInpage === undefined) {
    const tag = document.createElement('script');

    tag.src = chrome.runtime.getURL('inpage.js');
    tag.async = false;

    document.documentElement.prepend(tag);
    tag.remove();
}

const toPage = (kind: 'reply' | 'event', payload: unknown) => {
    window.postMessage({ __nura: kind, payload }, '/');
};

let port: chrome.runtime.Port | undefined;

const connect = () => {
    // After an extension reload or update the old context is dead, and connecting through it
    // throws. Every page that ever loaded us would otherwise spin forever on its next call.
    if (chrome.runtime?.id === undefined) {
        return undefined;
    }

    try {
        const opened = chrome.runtime.connect({ name: providerChannel });

        opened.onMessage.addListener((message: WorkerMessage) => {
            toPage(message.kind, message.payload);
        });

        opened.onDisconnect.addListener(() => {
            port = undefined;
        });

        return opened;
    } catch {
        return undefined;
    }
};

window.addEventListener('message', (event) => {
    if (event.source !== window || !isPageMessage(event.data) || event.data.__nura !== 'request') {
        return;
    }

    port ??= connect();

    try {
        port?.postMessage({ kind: 'rpc', payload: event.data.payload });
    } catch {
        port = undefined;
    }
});

// accountsChanged and chainChanged reach a frame whose port died with a previous worker, so they
// come as a plain message rather than down the port.
chrome.runtime.onMessage.addListener((message: WorkerMessage | DockMessage) => {
    if (message.kind === 'event') {
        toPage('event', message.payload);

        return;
    }

    // Still deciding nothing: the worker asked for its own panel, and this hands the request
    // straight back. What it adds on the way is the one thing the worker cannot have — the click
    // the page's call came out of is live in this frame for a few seconds yet, and a browser opens
    // a docked panel for nothing else.
    if (message.kind === 'dock') {
        void chrome.runtime.sendMessage({ kind: dockChannel }).catch(() => undefined);
    }
});
