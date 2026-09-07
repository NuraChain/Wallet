import { providerChannel } from './message';

/**
 * The worker is the only context that exists when a dApp calls — the popup is shut almost all of
 * the time. Every listener is registered here, synchronously, before anything is awaited: one
 * attached after the first microtask misses the very event that woke the worker.
 */

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== providerChannel) {
        return;
    }

    // The origin is taken from the sender, which only the browser can write. A page saying who it
    // is would be a page choosing which site's grants to spend.
    const sender = port.sender;

    if (sender?.id !== chrome.runtime.id || sender.tab?.id === undefined) {
        port.disconnect();
    }
});
