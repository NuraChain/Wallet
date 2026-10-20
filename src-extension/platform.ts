import { providerChannel } from './message.ts';

import type { DappPrompt } from '../src/type/dapp';
import type { Vault } from '../src/type/wallet';
import type { Platform, PlatformApproval, PlatformDapp, PlatformExporter, PlatformSession } from '../src/type/platform';

export const idleMinutes = 15;

const sessionKey = 'Session';
const promptKey = 'Prompts';
const windowKey = 'ApprovalWindow';

export const walletWindowKey = 'WalletWindow';

let caller: { windowId?: number; tabId: number; frameId: number } | undefined;

const panelDocument = 'sidepanel.html';

const windowDocument = `${panelDocument}?window`;

interface SessionRecord {
    vault: Vault;
    expiresAt: number;
}

const deadline = () => Date.now() + idleMinutes * 60_000;

const readRecord = async (): Promise<SessionRecord | undefined> => {
    const held = await chrome.storage.session.get(sessionKey);

    const record = held[sessionKey] as SessionRecord | undefined;

    if (record === undefined || typeof record.expiresAt !== 'number') {
        return undefined;
    }

    if (record.expiresAt <= Date.now()) {
        await chrome.storage.session.remove(sessionKey);

        return undefined;
    }

    return record;
};

// storage.session is memory-only and hidden from content scripts; the deadline is all that locks it.
const browserSession: PlatformSession = {
    read: async () => (await readRecord())?.vault,

    write: async (vault) => {
        if (vault === undefined) {
            await chrome.storage.session.remove(sessionKey);

            return;
        }

        await chrome.storage.session.set({ [sessionKey]: { vault, expiresAt: deadline() } satisfies SessionRecord });
    },

    watch: (listener) => {
        const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
            if (area !== 'session' || !(sessionKey in changes)) {
                return;
            }

            const record = changes[sessionKey]?.newValue as SessionRecord | undefined;

            listener(record?.vault);
        };

        chrome.storage.onChanged.addListener(onChanged);

        return () => {
            chrome.storage.onChanged.removeListener(onChanged);
        };
    },

    touch: async () => {
        const record = await readRecord();

        if (record !== undefined) {
            await chrome.storage.session.set({ [sessionKey]: { ...record, expiresAt: deadline() } satisfies SessionRecord });
        }
    }
};

const save = async (href: string, name: string, revoke = false) => {
    if (globalThis.document === undefined) {
        return 'unsupported';
    }

    try {
        const anchor = document.createElement('a');

        anchor.href = href;
        anchor.download = name;

        document.body.append(anchor);
        anchor.click();
        anchor.remove();

        if (revoke) {
            URL.revokeObjectURL(href);
        }

        return '';
    } catch (cause) {
        return cause instanceof Error && cause.message.length > 0 ? cause.message : 'failed';
    }
};

// @types/chrome does not describe Gecko's sidebarAction.
interface SidebarAction {
    open: () => void;
    close: () => Promise<void>;
}

interface SidePanel {
    open: (options: { windowId: number }) => Promise<void>;
    setPanelBehavior?: (behavior: { openPanelOnActionClick: boolean }) => Promise<void>;
}

// Read off the global: AMO's linter flags chrome.sidePanel.open written in full as unimplemented.
const surfaces = () => globalThis as unknown as { browser?: { sidebarAction?: SidebarAction }; chrome?: { sidePanel?: SidePanel } };

const inPanel = () => globalThis.location?.pathname.endsWith(panelDocument) === true && globalThis.location.search === '';

const hasDock = () => {
    const { browser, chrome: chromium } = surfaces();

    return browser?.sidebarAction !== undefined || chromium?.sidePanel !== undefined;
};

// Must be called straight out of a user gesture with nothing awaited before it, or both engines refuse.
export const openDock = () => {
    const { browser, chrome: chromium } = surfaces();

    if (browser?.sidebarAction !== undefined) {
        try {
            browser.sidebarAction.open();
        } catch {
            // No gesture left; the badge still shows a page is waiting.
        }

        return;
    }

    if (chromium?.sidePanel !== undefined && caller?.windowId !== undefined) {
        void chromium.sidePanel.open({ windowId: caller.windowId }).catch(() => undefined);
    }
};

const focus = async (id: number | undefined) => {
    if (id === undefined) {
        return false;
    }

    try {
        await chrome.windows.update(id, { focused: true, drawAttention: true });

        return true;
    } catch {
        return false;
    }
};

const focusOrOpen = async (key: string, url: string) => {
    const held = await chrome.storage.session.get(key);

    if (await focus(held[key] as number | undefined)) {
        return;
    }

    const created = await chrome.windows.create({ type: 'popup', url, width: 400, height: 640, focused: true });

    if (created?.id !== undefined) {
        await chrome.storage.session.set({ [key]: created.id });
    }
};

// Gecko's sidebar is shut here while the menu click is still a gesture; Chromium's in keepOneSurface.
export const openWindow = () => {
    void surfaces()
        .browser?.sidebarAction?.close()
        .catch(() => undefined);

    void focusOrOpen(walletWindowKey, windowDocument);
};

// Gecko's sidebar ignores window.close(), so openWindow shuts that one itself.
export const keepOneSurface = () => {
    if (!inPanel()) {
        return;
    }

    void chrome.storage.session.get(walletWindowKey).then((held) => {
        const open = held[walletWindowKey] as number | undefined;

        if (open !== undefined) {
            void chrome.windows.remove(open).catch(() => undefined);
        }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'session' && changes[walletWindowKey]?.newValue !== undefined) {
            globalThis.close();
        }
    });
};

export const dockOnActionClick = () => {
    const { chrome: chromium } = surfaces();

    if (chromium?.sidePanel?.setPanelBehavior !== undefined) {
        void chromium.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

        return;
    }

    chrome.action.onClicked.addListener(() => {
        openDock();
    });
};

const frameLabel = (tabId: number, frameId: number) => `${tabId}:${frameId}`;

const readLabel = (label: string) => {
    const [tab, frame] = label.split(':');

    return { tabId: Number(tab), frameId: Number(frame) };
};

// The origin comes off port.sender, which only the browser writes, never the payload. Opaque 'null' origins are refused.
const browserDapp: PlatformDapp = {
    emit: (label, body) => {
        const { tabId, frameId } = readLabel(label);

        if (Number.isNaN(tabId)) {
            return;
        }

        void chrome.tabs.sendMessage(tabId, { kind: 'event', payload: body }, { frameId }).catch(() => undefined);
    },

    serve: (accept) => {
        // Worker only: onConnect fires in every extension context, and a window would answer a second time.
        if (globalThis.document !== undefined) {
            return () => undefined;
        }

        const onConnect = (port: chrome.runtime.Port) => {
            if (port.name !== providerChannel) {
                return;
            }

            const sender = port.sender;

            if (sender?.id !== chrome.runtime.id || sender.tab?.id === undefined) {
                port.disconnect();

                return;
            }

            const claimed = sender.origin ?? sender.url ?? '';

            if (claimed.length === 0 || claimed === 'null') {
                port.disconnect();

                return;
            }

            const label = frameLabel(sender.tab.id, sender.frameId ?? 0);

            port.onMessage.addListener((message: { kind?: string; payload?: unknown }) => {
                if (message.kind !== 'rpc' || typeof message.payload !== 'string') {
                    return;
                }

                // Per call, not at connect: the tab may have moved to another window since.
                caller = { windowId: sender.tab?.windowId, tabId: sender.tab?.id ?? -1, frameId: sender.frameId ?? 0 };

                accept({
                    label,
                    origin: claimed,
                    payload: message.payload,
                    respond: (reply) => {
                        try {
                            port.postMessage({ kind: 'reply', payload: reply });
                        } catch {
                            // The frame went away while the user was deciding.
                        }
                    }
                });
            });
        };

        chrome.runtime.onConnect.addListener(onConnect);

        return () => {
            chrome.runtime.onConnect.removeListener(onConnect);
        };
    }
};

// Keeps the worker alive while a prompt stands: eviction after ~30s idle would lose the page's resolver.
let holding: ReturnType<typeof setInterval> | undefined;

const holdWhileAsking = (asking: boolean) => {
    if (asking && holding === undefined) {
        holding = setInterval(() => {
            void chrome.runtime.getPlatformInfo().catch(() => undefined);
        }, 20_000);
    } else if (!asking && holding !== undefined) {
        clearInterval(holding);

        holding = undefined;
    }
};

const browserApproval: PlatformApproval = {
    publish: (prompts) => {
        holdWhileAsking(prompts.length > 0);

        void chrome.storage.session.set({ [promptKey]: prompts });

        void chrome.action.setBadgeText({ text: prompts.length > 0 ? String(prompts.length) : '' }).catch(() => undefined);
    },

    subscribe: (listener) => {
        const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
            if (area !== 'session' || !(promptKey in changes)) {
                return;
            }

            listener((changes[promptKey]?.newValue as DappPrompt[] | undefined) ?? []);
        };

        chrome.storage.onChanged.addListener(onChanged);

        // A window reads the queue published before it opened; the worker must not read back a stale one.
        if (globalThis.document !== undefined) {
            void chrome.storage.session.get(promptKey).then((held) => {
                const standing = held[promptKey] as DappPrompt[] | undefined;

                if (standing !== undefined && standing.length > 0) {
                    listener(standing);
                }
            });
        }

        return () => {
            chrome.storage.onChanged.removeListener(onChanged);
        };
    },

    answer: (id, approved) => {
        void chrome.runtime.sendMessage({ kind: 'approval/answer', id, approved }).catch(() => undefined);
    },

    surface: () => {
        // The calling frame opens the dock: the user gesture is spent here but still live there.
        if (hasDock()) {
            void (async () => {
                const held = await chrome.storage.session.get(walletWindowKey);

                if (await focus(held[walletWindowKey] as number | undefined)) {
                    return;
                }

                if (caller !== undefined && caller.tabId >= 0) {
                    await chrome.tabs.sendMessage(caller.tabId, { kind: 'dock' }, { frameId: caller.frameId }).catch(() => undefined);
                }
            })();

            return;
        }

        // Safari has no dock, so the prompt gets its own window.
        void focusOrOpen(windowKey, 'popup.html');
    },

    dismiss: () => {
        void (async () => {
            const held = await chrome.storage.session.get(windowKey);

            const open = held[windowKey] as number | undefined;

            await chrome.storage.session.remove(windowKey);

            if (open !== undefined) {
                try {
                    await chrome.windows.remove(open);
                } catch {
                    // Already closed by the user.
                }
            }
        })();
    }
};

const anchorExporter: PlatformExporter = {
    saveImage: async (base64Png: string, name: string) => save(`data:image/png;base64,${base64Png}`, name),

    saveText: async (text: string, name: string) => save(URL.createObjectURL(new Blob([text], { type: 'text/plain' })), name, true)
};

export const platform: Platform = {
    session: browserSession,
    approval: browserApproval,
    dapp: browserDapp,

    storage: {
        get: async (key) => {
            const held = await chrome.storage.local.get(key);

            const value: unknown = held[key];

            return typeof value === 'string' ? value : undefined;
        },

        set: async (key, value) => chrome.storage.local.set({ [key]: value }),

        remove: async (keys) => chrome.storage.local.remove(keys)
    },

    host: () => 'extension',

    // Host permissions exempt this from CORS, which the Tauri HTTP plugin handles on the other side.
    fetch: async (url, init) => fetch(url, init),

    openUrl: async (url) => {
        await chrome.tabs.create({ url });
    },

    exporter: () => anchorExporter
};
