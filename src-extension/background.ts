import { platform } from '../src/platform';

import { dockChannel } from './message.ts';
import { dockOnActionClick, openDock, openWindow, walletWindowKey } from './platform.ts';

import { loadConnections } from '../src/core/dapp';
import { vaultAddress } from '../src/core/vault';
import { initNetwork } from '../src/core/network';
import { loadAccounts } from '../src/utility/account';
import { startDappBridge } from '../src/core/dapp.bridge';
import { getVault, restoreSession } from '../src/core/session';
import { getDappPrompt, rejectDappPrompts, resolveDappPrompt } from '../src/core/dapp.prompt';
import { answerDapp, setDappAccount, syncDappState } from '../src/core/dapp.rpc';
import type { StorageKey } from '../src/type/storage';

// Register every listener synchronously: one attached after an await misses the event that woke the worker.

const lockAlarm = 'nura:lock';

const windowKey = 'ApprovalWindow';

const windowMenu = 'nura:window';

// At module scope, not in onInstalled: the setting lasts only for this worker start.
dockOnActionClick();

// Safari has no contextMenus namespace.
chrome.contextMenus?.onClicked.addListener((info) => {
    if (info.menuItemId === windowMenu) {
        openWindow();
    }
});

// Keeps content scripts from reading the decrypted seed; already the default, stated explicitly.
const holdTheSessionClosed = () => {
    try {
        void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    } catch {
        // Firefox and Safari lack it; trusted-only is their only level.
    }
};

// After eviction the router forgets the account, and eth_accounts would tell every site it was disconnected.
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

const bootstrap = async () => {
    holdTheSessionClosed();

    // A stored queue belongs to promises a previous worker held; nothing can answer it now.
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

// Windows change these in their own module copies; storage is all they share with the worker.
const shared = new Set<string>(['App.Network', 'App.Networks', 'Wallet.Accounts', 'Wallet.Active', 'Browser.Connections'] satisfies StorageKey[]);

const readBack = () => {
    void boot().then(adopt);
};

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.keys(changes).some((key) => shared.has(key))) {
        readBack();
    }
});

// Not sender.tab: a docked panel reports a tab just as a content script does.
const fromWallet = (sender: chrome.runtime.MessageSender) => sender.url?.startsWith(chrome.runtime.getURL('')) === true;

chrome.runtime.onMessage.addListener((message: { kind?: string; id?: string; approved?: boolean }, sender) => {
    if (sender.id !== chrome.runtime.id) {
        return;
    }

    // No await: the user gesture does not survive a microtask. Only while a prompt is held, so a page cannot open the panel at will.
    if (message.kind === dockChannel && !fromWallet(sender)) {
        if (getDappPrompt() !== undefined) {
            openDock();
        }

        return;
    }

    // A content script may not answer on the user's behalf.
    if (!fromWallet(sender)) {
        return;
    }

    if (message.kind === 'approval/answer' && typeof message.id === 'string' && typeof message.approved === 'boolean') {
        void boot().then(() => {
            resolveDappPrompt(message.id as string, message.approved as boolean);
        });
    }
});

// Closing the approval window (Safari only) is a refusal; closing a dock leaves the queue standing.
chrome.windows.onRemoved.addListener((closed) => {
    void (async () => {
        const held = await chrome.storage.session.get([windowKey, walletWindowKey]);

        if (held[walletWindowKey] === closed) {
            await chrome.storage.session.remove(walletWindowKey);
        }

        if (held[windowKey] === closed) {
            await chrome.storage.session.remove(windowKey);

            rejectDappPrompts();
        }
    })();
});

// setTimeout does not survive eviction; reading drops a session that is past its deadline.
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === lockAlarm) {
        void platform.session.read();
    }
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(lockAlarm, { periodInMinutes: 1 });

    // Menus outlive an update, and creating one twice is an error.
    void chrome.contextMenus?.removeAll().then(() => {
        chrome.contextMenus.create({ id: windowMenu, title: 'Open in window', contexts: ['action'] });
    });

    void boot();
});

chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create(lockAlarm, { periodInMinutes: 1 });

    // Belt and braces: a restart should already have cleared session storage.
    void platform.session.write(undefined);
});

platform.session.watch(readBack);

void boot();
