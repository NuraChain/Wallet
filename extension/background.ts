import { platform } from '../src/platform';

import type { StorageKey } from '../src/utility/storage.key';

import { dockChannel } from './message.ts';
import { dockOnActionClick, openDock } from './platform.ts';

import { loadConnections } from '../src/core/dapp';
import { vaultAddress } from '../src/core/vault';
import { initNetwork } from '../src/core/network';
import { loadAccounts } from '../src/utility/account';
import { startDappBridge } from '../src/core/dapp.bridge';
import { getVault, restoreSession } from '../src/core/session';
import { getDappPrompt, rejectDappPrompts, resolveDappPrompt } from '../src/core/dapp.prompt';
import { answerDapp, setDappAccount, syncDappState } from '../src/core/dapp.rpc';

/**
 * The worker is the only context that exists when a dApp calls — the popup is shut almost all of
 * the time. Every listener is registered here, synchronously, before anything is awaited: one
 * attached after the first microtask misses the very event that woke the worker.
 */

const lockAlarm = 'nura:lock';

const windowKey = 'ApprovalWindow';

// Registered at module scope, not in onInstalled: the setting is per worker start, and a button
// with no popup behind it and nothing bound to it does nothing at all when pressed.
dockOnActionClick();

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

/**
 * Everything the worker holds that some other context decides.
 *
 * The account is the one that matters. It lives in a module variable in the RPC router, and a
 * router that has forgotten it answers `eth_accounts` with nothing — so every connected site
 * would be told it had been disconnected, about thirty seconds after the user stopped typing.
 */
const adopt = async () => {
    await Promise.all([initNetwork(), loadConnections()]);

    const vault = getVault();

    if (vault === undefined) {
        setDappAccount('', 0);
    } else {
        const { active } = await loadAccounts();

        setDappAccount(vaultAddress(vault, active), active);
    }

    syncDappState();
};

/** Everything the worker forgets when it is evicted. */
const bootstrap = async () => {
    holdTheSessionClosed();

    // A queue left in storage belongs to promises this worker does not have — whoever was waiting on
    // them went away with the last one. Emptying it is what stops a window drawing a question that
    // can no longer be answered, and the badge counting it.
    platform.approval.publish([]);

    await restoreSession();

    await adopt();
};

let ready: Promise<void> | undefined;

const boot = async () => (ready ??= bootstrap());

startDappBridge(async (envelope) => {
    await boot();

    return answerDapp(envelope);
});

/**
 * A window is where the wallet is unlocked, the account picked, the chain switched and a site
 * disconnected — each of them in that window's own copy of these modules, with storage the only
 * thing it shares with the worker. Nothing here is told any of it, so the lot is read back whenever
 * one of those writes lands.
 *
 * Without this the worker goes on answering out of whatever it held when it woke, which after an
 * unlock in a window is no address at all: the page is told the wallet is locked while the user is
 * looking at it open, and the approval they are handed belongs to a call that was already refused.
 */
const shared = new Set<string>(['App.Network', 'App.Networks', 'Wallet.Accounts', 'Wallet.Active', 'Browser.Connections'] satisfies StorageKey[]);

const readBack = () => {
    void boot().then(adopt);
};

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.keys(changes).some((key) => shared.has(key))) {
        readBack();
    }
});

/**
 * Whether a message came from one of the wallet's own documents rather than from a content script.
 *
 * `sender.tab` cannot answer that. A docked panel is attached to a tab and reports one, exactly as
 * a content script does — so the guard that read it threw away every answer the panel sent, which
 * is a prompt the user approves and nothing happens. The URL does answer it: a content script
 * reports the page it is running in, and only our own documents report ours.
 */
const fromWallet = (sender: chrome.runtime.MessageSender) => sender.url?.startsWith(chrome.runtime.getURL('')) === true;

// The two things sent at the worker by name: a relay handing back a click, and a window answering
// a prompt the worker is holding.
chrome.runtime.onMessage.addListener((message: { kind?: string; id?: string; approved?: boolean }, sender) => {
    if (sender.id !== chrome.runtime.id) {
        return;
    }

    // The click the page's own call came out of, handed back by the frame that still holds it,
    // which is the only thing a browser will open a docked panel for. Nothing is awaited on the
    // way — a gesture does not survive a microtask — and it is honoured only while the wallet is
    // actually holding a question, so a page cannot pull the panel open whenever it likes.
    if (message.kind === dockChannel && !fromWallet(sender)) {
        if (getDappPrompt() !== undefined) {
            openDock();
        }

        return;
    }

    // Anything else from a page is a content script, which has no business answering on the user's
    // behalf.
    if (!fromWallet(sender)) {
        return;
    }

    if (message.kind === 'approval/answer' && typeof message.id === 'string' && typeof message.approved === 'boolean') {
        void boot().then(() => {
            resolveDappPrompt(message.id as string, message.approved as boolean);
        });
    }
});

// Closing the window is a refusal, the same as pressing the button that says so. Only Safari ever
// opens one; where the queue is drawn in a dock, closing it leaves the queue — and the count on
// the toolbar button — standing, so the user can come back to it.
chrome.windows.onRemoved.addListener((closed) => {
    void (async () => {
        const held = await chrome.storage.session.get(windowKey);

        if (held[windowKey] === closed) {
            await chrome.storage.session.remove(windowKey);

            rejectDappPrompts();
        }
    })();
});

// setTimeout does not survive an evicted worker, so the deadline is checked on an alarm instead.
// Reading is enough to enforce it: the store drops a record that is past due as it reads it.
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === lockAlarm) {
        void platform.session.read();
    }
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(lockAlarm, { periodInMinutes: 1 });

    void boot();
});

chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create(lockAlarm, { periodInMinutes: 1 });

    // A browser restart clears session storage on its own; this is belt and braces for the case
    // where it did not, so the wallet never comes back up already open.
    void platform.session.write(undefined);
});

// The vault moved — an unlock or a lock in a window, or this worker's own deadline running out.
// Both directions land here: the router has an address to start answering with, or none to stop
// answering with, and every connected page is owed the news either way.
platform.session.watch(readBack);

void boot();
