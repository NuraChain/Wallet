import { dockChannel, isPageMessage, providerChannel } from './message';
import type { DockMessage, WorkerMessage } from '../src/type/extension';

// The origin is never read here: the worker takes it off port.sender, which only the browser writes.

// Chromium injects via world: 'MAIN'; elsewhere a synchronous tag must beat a page reading window.ethereum in <head>.
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

// Failed with 4900 if the worker dies mid-call, so the page is not left waiting forever.
const unanswered = new Set<string>();

const idOf = (body: unknown) => {
    try {
        const parsed: unknown = typeof body === 'string' ? JSON.parse(body) : body;

        return typeof parsed === 'object' && parsed !== null && 'id' in parsed && typeof parsed.id === 'string' ? parsed.id : '';
    } catch {
        return '';
    }
};

const strand = (ids: Iterable<string>) => {
    for (const id of ids) {
        toPage('reply', { id, error: { code: 4900, message: 'Nura Wallet stopped before answering. Try again.' } });
    }
};

const connect = () => {
    // After an extension reload this context is dead and connecting through it throws.
    if (chrome.runtime?.id === undefined) {
        return undefined;
    }

    try {
        const opened = chrome.runtime.connect({ name: providerChannel });

        opened.onMessage.addListener((message: WorkerMessage) => {
            if (message.kind === 'reply') {
                unanswered.delete(idOf(message.payload));
            }

            toPage(message.kind, message.payload);
        });

        opened.onDisconnect.addListener(() => {
            port = undefined;

            strand(unanswered);

            unanswered.clear();
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

    const id = idOf(event.data.payload);

    try {
        if (port === undefined) {
            throw new Error('no worker to ask');
        }

        port.postMessage({ kind: 'rpc', payload: event.data.payload });

        if (id.length > 0) {
            unanswered.add(id);
        }
    } catch {
        port = undefined;

        strand(id.length > 0 ? [id] : []);
    }
});

// Events come as a plain message: the frame's port may have died with a previous worker.
chrome.runtime.onMessage.addListener((message: WorkerMessage | DockMessage) => {
    if (message.kind === 'event') {
        toPage('event', message.payload);

        return;
    }

    // Bounced back to the worker because the page's user gesture is still live in this frame.
    if (message.kind === 'dock') {
        void chrome.runtime.sendMessage({ kind: dockChannel }).catch(() => undefined);
    }
});
