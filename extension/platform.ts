import { providerChannel } from './message.ts';

import type { DappPrompt } from '../src/core/dapp.prompt';
import type { Vault } from '../src/core/vault';
import type { Platform, PlatformApproval, PlatformDapp, PlatformExporter, PlatformPanel, PlatformSession } from '../src/platform/type';

/** How long an unlocked wallet survives without being touched. */
export const idleMinutes = 15;

const sessionKey = 'Session';
const promptKey = 'Prompts';
const windowKey = 'ApprovalWindow';

/**
 * The frame whose call is waiting on the user: which window to dock beside, and which frame still
 * holds the click to open it with.
 */
let caller: { windowId?: number; tabId: number; frameId: number } | undefined;

/** The document the browser docks: the same app as the popup, under a page that fills its frame. */
const panelDocument = 'sidepanel.html';

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

/**
 * `chrome.storage.session` is the one store the browser keeps in memory and never writes to
 * disk, clears when the browser closes, and — at its default access level — hides from content
 * scripts. That makes it the only place an evictable worker can leave a decrypted seed and still
 * be holding it a moment later. It outlives the popup, which the module variable it replaces did
 * not, so the deadline below is what takes its place: nothing else would ever lock the wallet.
 */
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

/** Gecko's half of the pair. `@types/chrome` only describes Chromium's, so this states the one call. */
interface SidebarAction {
    open: () => void;
}

/** Chromium's half, which needs to be told which window to dock the panel in. */
interface SidePanel {
    open: (options: { windowId: number }) => Promise<void>;
    setPanelBehavior?: (behavior: { openPanelOnActionClick: boolean }) => Promise<void>;
}

/**
 * Each engine has exactly one of these and neither knows the other's, which is what picks the
 * branch below. Both are read off the global rather than named outright: `chrome.sidePanel.open`
 * written in full is what AMO's linter reports as an unimplemented API, in a bundle Firefox
 * shares with the other three targets and never reaches that line of.
 */
const surfaces = () => globalThis as unknown as { browser?: { sidebarAction?: SidebarAction }; chrome?: { sidePanel?: SidePanel } };

const inPanel = () => globalThis.location?.pathname.endsWith(panelDocument) === true;

/** Whether this engine has a frame to dock into at all. Safari has neither of the two. */
const hasDock = () => {
    const { browser, chrome: chromium } = surfaces();

    return browser?.sidebarAction !== undefined || chromium?.sidePanel !== undefined;
};

/**
 * Dock the wallet beside the page.
 *
 * Both engines refuse this unless the call is made straight out of a user gesture, and nothing may
 * be awaited before it, so every caller is somewhere that already holds one: the toolbar button,
 * or the relay handing back the click a page's own call came out of. A refusal is still possible —
 * a call that came from no click at all — and is left to the badge rather than reported.
 */
export const openDock = () => {
    const { browser, chrome: chromium } = surfaces();

    if (browser?.sidebarAction !== undefined) {
        try {
            browser.sidebarAction.open();
        } catch {
            // No gesture left to spend it on; the badge is what says a page is waiting.
        }

        return;
    }

    if (chromium?.sidePanel !== undefined && caller?.windowId !== undefined) {
        void chromium.sidePanel.open({ windowId: caller.windowId }).catch(() => undefined);
    }
};

/**
 * The toolbar button is the only way in now that no popup hangs off it. Chromium has a setting for
 * exactly this. Gecko has to be told at the click instead — which is a gesture, so it is the one
 * open that never gets refused. Safari keeps its popup and never reaches the listener.
 */
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

/**
 * A popup or window the browser opens for an extension document has no close button of its own,
 * so the wallet carries one. The dock has the browser's own, and draws no title bar here.
 */
const browserPanel: PlatformPanel = {
    docked: inPanel,
    close: () => {
        globalThis.close();
    }
};

/**
 * A frame is named by the tab and frame it is, which is what an event has to be aimed back at.
 */
const frameLabel = (tabId: number, frameId: number) => `${tabId}:${frameId}`;

const readLabel = (label: string) => {
    const [tab, frame] = label.split(':');

    return { tabId: Number(tab), frameId: Number(frame) };
};

/**
 * Provider calls arrive over a port the page's relay opens. Everything about who is calling comes
 * off `port.sender`, which only the browser can write — the payload is never asked. An opaque
 * origin (a sandboxed frame, a data: document) reads as 'null' and is refused outright, or every
 * such frame on the web would share one entry in the granted-origins list.
 */
const browserDapp: PlatformDapp = {
    emit: (label, body) => {
        const { tabId, frameId } = readLabel(label);

        if (Number.isNaN(tabId)) {
            return;
        }

        void chrome.tabs.sendMessage(tabId, { kind: 'event', payload: body }, { frameId }).catch(() => undefined);
    },

    serve: (accept) => {
        // Only the worker. `onConnect` fires in every extension context at once, so a window with
        // the wallet open would take the same call a second time and answer it out of its own copy
        // of the router — two replies for one id, and the page believes whichever won the race.
        // A window renders the queue the worker publishes and answers it by name instead.
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

                // Noted here rather than at connect: the port outlives the frame's stay in any one
                // window, and this is the last call before something may need docking beside it.
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

/**
 * The worker asks; a window draws. The queue rides `chrome.storage.session` because that is a
 * push channel both ends already share — no port to keep alive, and it survives the worker being
 * evicted mid-approval, which a promise chain would not.
 *
 * There is at most one surface. A second request while one is open joins the queue that surface
 * is already rendering rather than stacking another frame on the user.
 */
const browserApproval: PlatformApproval = {
    publish: (prompts) => {
        void chrome.storage.session.set({ [promptKey]: prompts });

        // The toolbar button is the only thing of ours on screen when nothing is open, and the
        // panel is one click away on it, so the count is what says a page is waiting.
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

        // The question a panel was opened for was published before that panel existed, and a change
        // listener only ever hears the next one — so the queue already standing has to be read. Only
        // in a window: the worker publishes its own and would be reading its own writing back, or,
        // after an eviction, a queue belonging to promises it no longer has.
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
        // The dock is the whole surface on the engines that have one: a queue that outlives a click
        // is exactly what a frame the browser holds open is for. Opening it is asked of the frame
        // that called rather than done here — the click this call came out of is spent by the time
        // the worker has finished deciding an approval is needed, but it is still live over there.
        if (hasDock()) {
            if (caller !== undefined && caller.tabId >= 0) {
                void chrome.tabs.sendMessage(caller.tabId, { kind: 'dock' }, { frameId: caller.frameId }).catch(() => undefined);
            }

            return;
        }

        // Safari has neither a side panel nor a sidebar, so the question still needs a window of
        // its own there.
        void (async () => {
            const held = await chrome.storage.session.get(windowKey);

            const open = held[windowKey] as number | undefined;

            if (open !== undefined) {
                try {
                    await chrome.windows.update(open, { focused: true, drawAttention: true });

                    return;
                } catch {
                    // It was closed since we noted it; fall through and open another.
                }
            }

            const created = await chrome.windows.create({ type: 'popup', url: 'popup.html', width: 400, height: 640, focused: true });

            if (created?.id !== undefined) {
                await chrome.storage.session.set({ [windowKey]: created.id });
            }
        })();
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
                    // The user closed it first, which is the same outcome.
                }
            }
        })();
    }
};

/**
 * A service worker has no DOM to hang an anchor on, so the export only works from a page. Every
 * caller is one — the phrase screen — and the word matches what the Android bridge answers when
 * it refuses, so the screen already knows how to say it.
 */
const anchorExporter: PlatformExporter = {
    saveImage: async (base64Png: string, name: string) => save(`data:image/png;base64,${base64Png}`, name),

    saveText: async (text: string, name: string) => save(URL.createObjectURL(new Blob([text], { type: 'text/plain' })), name, true)
};

export const platform: Platform = {
    session: browserSession,
    approval: browserApproval,
    dapp: browserDapp,
    panel: browserPanel,

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

    // With host permissions this is not subject to CORS, which is the one thing the Tauri HTTP
    // plugin was carrying for the app. Nothing else about it differs from the global.
    fetch: async (url, init) => fetch(url, init),

    openUrl: async (url) => {
        await chrome.tabs.create({ url });
    },

    exporter: () => anchorExporter
};
