import { load, type Store } from '@tauri-apps/plugin-store';
import { fetch as nativeFetch } from '@tauri-apps/plugin-http';
import { platform as hostPlatform } from '@tauri-apps/plugin-os';
import { openUrl as openExternal } from '@tauri-apps/plugin-opener';
import { BaseDirectory, mkdir, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';

import type { Host } from '../utility/platform.type';
import type { Platform, PlatformExporter, PlatformSession } from './type';

interface AndroidBridge {
    saveImage: (base64Png: string, name: string) => string;
    saveText: (text: string, name: string) => string;
}

declare global {
    interface Window {
        __nuraExport?: AndroidBridge;
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

let host: Host | undefined;

export const platform: Platform = {
    session: inertSession,

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
