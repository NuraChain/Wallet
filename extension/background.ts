import { platform } from '../src/platform';

import { providerChannel } from './message';

/**
 * The worker is the only context that exists when a dApp calls — the popup is shut almost all of
 * the time. Every listener is registered here, synchronously, before anything is awaited: one
 * attached after the first microtask misses the very event that woke the worker.
 */

const lockAlarm = 'nura:lock';

/**
 * The default already is trusted-only, and Firefox and Safari have no other setting. Saying it
 * out loud is worth the two lines: it is what keeps a content script — code running inside any
 * page the user visits — from reading the decrypted seed.
 */
const holdTheSessionClosed = () => {
    try {
        void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    } catch {
        // Not implemented here, and trusted-only is the only level those engines have.
    }
};

chrome.runtime.onInstalled.addListener(() => {
    holdTheSessionClosed();

    chrome.alarms.create(lockAlarm, { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
    holdTheSessionClosed();

    chrome.alarms.create(lockAlarm, { periodInMinutes: 1 });

    // A browser restart clears session storage on its own; this is belt and braces for the case
    // where it did not, so the wallet never comes back up already open.
    void platform.session.write(undefined);
});

// setTimeout does not survive an evicted worker, so the deadline is checked on an alarm instead.
// Reading is enough to enforce it: the store drops a record that is past due as it reads it.
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === lockAlarm) {
        void platform.session.read();
    }
});

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
