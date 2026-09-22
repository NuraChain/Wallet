import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { load, type Store } from '@tauri-apps/plugin-store';
import { fetch as nativeFetch } from '@tauri-apps/plugin-http';
import { platform as hostPlatform } from '@tauri-apps/plugin-os';
import { openUrl as openExternal } from '@tauri-apps/plugin-opener';
import { BaseDirectory, mkdir, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';

import type { Host } from '../utility/platform.type';
import type { Platform, PlatformApproval, PlatformDapp, PlatformExporter, PlatformPanel, PlatformSession } from './type';

interface AndroidBridge {
    saveImage: (base64Png: string, name: string) => string;
    saveText: (text: string, name: string) => string;
}

declare global {
    interface Window {
        __nuraExport?: AndroidBridge;
        __nuraDappRequest?: (payload: string) => void;
        __nuraDappLink?: (url: string) => void;
    }
}

/**
 * Opened on first use rather than at module scope. The top-level await this replaces made every
 * importer of the storage module wait on the store file before it could even be evaluated.
 */
let opened: Promise<Store> | undefined;

const store = async () => (opened ??= load('application.bin'));

const pictureFolder = 'Nura Wallet';

const reason = (cause: unknown) => (cause instanceof Error && cause.message.length > 0 ? cause.message : 'failed');

const desktopExporter: PlatformExporter = {
    saveImage: async (base64Png: string, name: string) => {
        try {
            const binary = atob(base64Png);
            const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

            await mkdir(pictureFolder, { baseDir: BaseDirectory.Picture, recursive: true });

            await writeFile(`${pictureFolder}/${name}`, bytes, { baseDir: BaseDirectory.Picture });

            return '';
        } catch (cause) {
            return reason(cause);
        }
    },

    saveText: async (text: string, name: string) => {
        try {
            await writeTextFile(name, text, { baseDir: BaseDirectory.Download });

            return '';
        } catch (cause) {
            return reason(cause);
        }
    }
};

/**
 * iOS has no ExportBridge of its own yet, and the fs plugin is a desktop-only dependency, so there
 * is nothing on that platform that could write the file. It says so in the same word the Android
 * bridge uses when the write is refused, and the phrase stays on screen to be copied by hand.
 */
const unsupportedExporter: PlatformExporter = {
    saveImage: async () => 'unsupported',
    saveText: async () => 'unsupported'
};

/**
 * A Tauri window holds the unlocked vault in a module variable for as long as the process lives,
 * which is exactly as long as the user can see the app. There is nothing here to keep, and
 * nothing to expire it against.
 */
const inertSession: PlatformSession = {
    read: async () => undefined,
    write: async () => undefined,
    watch: () => () => undefined,
    touch: async () => undefined
};

/**
 * The window that asks is the window that draws the prompt, so the queue never leaves the module
 * it lives in and there is nothing here to publish, watch, or open.
 */
const inertApproval: PlatformApproval = {
    publish: () => undefined,
    subscribe: () => () => undefined,
    answer: () => undefined,
    surface: () => undefined,
    dismiss: () => undefined
};

/**
 * The window is its own frame, and the title bar closes it through Tauri rather than through here.
 */
const inertPanel: PlatformPanel = {
    docked: () => false,
    close: () => undefined
};

/**
 * Two native transports behind one shape. Desktop rides Tauri events and IPC: Rust stamps the
 * origin from the child webview's own URL and hands over a ticket to answer against. Android has
 * no Rust at all — the Kotlin bridge installs a pair of globals and stamps the origin itself.
 */
const nativeDapp: PlatformDapp = {
    emit: (label, body) => {
        const bridge = window.__nuraBrowser;

        if (bridge !== undefined) {
            bridge.dappEmit?.(label, body);

            return;
        }

        void invoke('dapp_emit', { label, payload: body }).catch(() => undefined);
    },

    serve: (accept, onLink) => {
        if (window.__nuraBrowser !== undefined) {
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

                accept({
                    label,
                    origin,
                    payload,
                    respond: (reply) => {
                        window.__nuraBrowser?.dappReply?.(label, JSON.stringify(reply));
                    }
                });
            };

            window.__nuraDappLink = (incoming: string) => {
                if (typeof incoming === 'string' && incoming.length > 0) {
                    onLink?.(incoming);
                }
            };

            return () => {
                window.__nuraDappRequest = undefined;
                window.__nuraDappLink = undefined;
            };
        }

        let dropped = false;

        const unlisten: (() => void)[] = [];

        const hold = (stop: () => void) => {
            if (dropped) {
                stop();

                return;
            }

            unlisten.push(stop);
        };

        // A subscription that never lands is the worst kind of failure here: Rust keeps answering
        // the page with a request nobody is listening for, and every call hangs until it times
        // out. It means a permission is missing, so it is said out loud rather than swallowed.
        const lost = (event: string) => (cause: unknown) => {
            // oxlint-disable-next-line no-console
            console.error('[bridge]', event, cause);
        };

        void listen<{ label: string; url: string }>('nura://dapp-link', (event) => {
            if (event.payload.url.length > 0) {
                onLink?.(event.payload.url);
            }
        }).then(hold, lost('nura://dapp-link'));

        void listen<{ ticket: number; label: string; origin: string; payload: string }>('nura://dapp-request', (event) => {
            const { ticket, label, origin, payload } = event.payload;

            accept({
                label,
                origin,
                payload,
                respond: (reply) => {
                    void invoke('dapp_respond', { ticket, payload: JSON.stringify(reply) }).catch(() => undefined);
                }
            });
        }).then(hold, lost('nura://dapp-request'));

        return () => {
            dropped = true;

            for (const stop of unlisten.splice(0)) {
                stop();
            }
        };
    }
};

let host: Host | undefined;

export const platform: Platform = {
    session: inertSession,
    approval: inertApproval,
    dapp: nativeDapp,
    panel: inertPanel,

    storage: {
        get: async (key) => (await store()).get<string>(key),

        set: async (key, value) => {
            const handle = await store();

            await handle.set(key, value);

            await handle.save();
        },

        remove: async (keys) => {
            const handle = await store();

            await Promise.all(keys.map(async (key) => handle.delete(key)));

            await handle.save();
        }
    },

    /**
     * Outside a Tauri window — `npm run dev` in a plain browser — the plugin throws, and 'unknown'
     * is the honest answer there. Read once and kept: the host cannot change while the process
     * lives, and the callers are on render paths.
     */
    host: () => {
        if (host === undefined) {
            try {
                host = hostPlatform();
            } catch {
                host = 'unknown';
            }
        }

        return host;
    },

    fetch: async (url, init) => nativeFetch(url, init),

    openUrl: async (url) => openExternal(url),

    exporter: () => {
        const bridge = window.__nuraExport;

        if (bridge === undefined) {
            return platform.host() === 'ios' ? unsupportedExporter : desktopExporter;
        }

        return {
            saveImage: async (base64Png: string, name: string) => bridge.saveImage(base64Png, name),
            saveText: async (text: string, name: string) => bridge.saveText(text, name)
        };
    }
};
