import { platform } from '../src/platform';

import { loadConnections } from '../src/core/dapp';
import { vaultAddress } from '../src/core/vault';
import { initNetwork } from '../src/core/network';
import { loadAccounts } from '../src/utility/account';
import { startDappBridge } from '../src/core/dapp.bridge';
import { getVault, restoreSession } from '../src/core/session';
import { rejectDappPrompts, resolveDappPrompt } from '../src/core/dapp.prompt';
import { answerDapp, setDappAccount, syncDappState } from '../src/core/dapp.rpc';

/**
 * The worker is the only context that exists when a dApp calls — the popup is shut almost all of
 * the time. Every listener is registered here, synchronously, before anything is awaited: one
 * attached after the first microtask misses the very event that woke the worker.
 */

const lockAlarm = 'nura:lock';

const windowKey = 'ApprovalWindow';

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
 * Everything the worker forgets when it is evicted.
 *
 * The account is the one that matters. It lives in a module variable in the RPC router, and a
 * router that has forgotten it answers `eth_accounts` with nothing — so every connected site
 * would be told it had been disconnected, about thirty seconds after the user stopped typing.
 */
const bootstrap = async () => {
    holdTheSessionClosed();

    await restoreSession();

    await Promise.all([initNetwork(), loadConnections()]);

    const vault = getVault();

    if (vault === undefined) {
        setDappAccount('', 0);

        return;
    }

    const { active } = await loadAccounts();

    setDappAccount(vaultAddress(vault, active), active);

    syncDappState();
};

let ready: Promise<void> | undefined;

const boot = async () => (ready ??= bootstrap());

startDappBridge(async (envelope) => {
    await boot();

    return answerDapp(envelope);
});

// A window answering a prompt the worker is holding. Anything with a tab is a content script,
// which has no business answering on the user's behalf.
chrome.runtime.onMessage.addListener((message: { kind?: string; id?: string; approved?: boolean }, sender) => {
    if (sender.id !== chrome.runtime.id || sender.tab !== undefined) {
        return;
    }

    if (message.kind === 'approval/answer' && typeof message.id === 'string' && typeof message.approved === 'boolean') {
        void boot().then(() => {
            resolveDappPrompt(message.id as string, message.approved as boolean);
        });
    }
});

// Closing the window is a refusal, the same as pressing the button that says so.
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

// The vault went away — a deadline, or a lock in some other window. Every connected page is owed
// the news, and the router has to stop answering with an address it no longer holds.
platform.session.watch((vault) => {
    if (vault === undefined) {
        setDappAccount('', 0);

        syncDappState();
    }
});

void boot();
