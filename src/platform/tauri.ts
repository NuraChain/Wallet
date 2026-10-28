import { invoke, type PluginListener } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { exit, onBackButtonPress } from '@tauri-apps/api/app';
import { load, type Store } from '@tauri-apps/plugin-store';
import { fetch as nativeFetch } from '@tauri-apps/plugin-http';
import { platform as hostPlatform } from '@tauri-apps/plugin-os';
import { openUrl as openExternal } from '@tauri-apps/plugin-opener';
import { BiometryType, biometricCipher, checkStatus } from '@tauri-apps/plugin-biometric';
import { BaseDirectory, mkdir, writeFile, writeTextFile } from '@tauri-apps/plugin-fs';

import type {
    BiometricFailure,
    BiometricKind,
    Host,
    Platform,
    PlatformApproval,
    PlatformBiometric,
    PlatformDapp,
    PlatformExporter,
    PlatformSession
} from '../type/platform';

interface AndroidBridge {
    saveImage: (base64Png: string, name: string) => string;
    saveText: (text: string, name: string) => string;
}

declare global {
    interface Window {
        __nuraExport?: AndroidBridge;
        __nuraDappRequest?: (payload: string) => void;
        __nuraDappLink?: (url: string, label?: unknown) => void;

        __nuraPermission?: (payload: string) => boolean;
    }
}

// Opened lazily: a top-level await would make every importer wait on the store file.
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

// iOS has no export bridge and the fs plugin is desktop-only; 'unsupported' matches Android's refusal.
const unsupportedExporter: PlatformExporter = {
    saveImage: async () => 'unsupported',
    saveText: async () => 'unsupported'
};

const inertSession: PlatformSession = {
    read: async () => undefined,
    write: async () => undefined,
    watch: () => () => undefined,
    touch: async () => undefined
};

const inertApproval: PlatformApproval = {
    publish: () => undefined,
    subscribe: () => () => undefined,
    answer: () => undefined,
    surface: () => undefined,
    dismiss: () => undefined
};

// Desktop: Rust stamps the origin from the webview's URL. Android: the Kotlin bridge stamps it.
const nativeDapp: PlatformDapp = {
    emit: (label, body) => {
        const bridge = window.__nuraBrowser;

        if (bridge !== undefined) {
            bridge.dappEmit?.(label, body);

            return;
        }

        void invoke('dapp_emit', { label, payload: body }).catch(() => undefined);
    },

    serve: (accept, onLink, onAsk) => {
        if (window.__nuraBrowser !== undefined) {
            // Kotlin refuses the request unless this returns true, so a locked wallet never leaves a page waiting.
            window.__nuraPermission = (incoming: string) => {
                let parsed: unknown;

                try {
                    parsed = JSON.parse(incoming);
                } catch {
                    return false;
                }

                if (
                    onAsk === undefined ||
                    typeof parsed !== 'object' ||
                    parsed === null ||
                    !('ticket' in parsed) ||
                    !('label' in parsed) ||
                    !('origin' in parsed) ||
                    !('kinds' in parsed)
                ) {
                    return false;
                }

                const { ticket, label, origin, kinds } = parsed;

                if (typeof ticket !== 'string' || typeof label !== 'string' || typeof origin !== 'string' || !Array.isArray(kinds)) {
                    return false;
                }

                const wanted = kinds.filter((item): item is string => typeof item === 'string');

                if (wanted.length === 0 || wanted.length !== kinds.length) {
                    return false;
                }

                onAsk({
                    label,
                    origin,
                    kinds: wanted,
                    respond: (allowed) => {
                        window.__nuraBrowser?.permissionReply?.(ticket, allowed);
                    }
                });

                return true;
            };

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

            window.__nuraDappLink = (incoming: string, label?: unknown) => {
                if (typeof incoming === 'string' && incoming.length > 0) {
                    onLink?.(incoming, typeof label === 'string' ? label : '');
                }
            };

            return () => {
                window.__nuraDappRequest = undefined;
                window.__nuraDappLink = undefined;
                window.__nuraPermission = undefined;
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

        // A failed listen means a missing permission and every call would hang, so it is logged.
        const lost = (event: string) => (cause: unknown) => {
            // oxlint-disable-next-line no-console
            console.error('[bridge]', event, cause);
        };

        void listen<{ label: string; url: string }>('nura://dapp-link', (event) => {
            if (event.payload.url.length > 0) {
                onLink?.(event.payload.url, event.payload.label);
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

const biometricKinds: Record<BiometryType, BiometricKind | undefined> = {
    [BiometryType.None]: undefined,
    [BiometryType.TouchID]: 'fingerprint',
    [BiometryType.FaceID]: 'face',
    [BiometryType.Iris]: 'iris'
};

const failureCodes = new Set<string>(['cancel', 'gone', 'unavailable', 'failed']);

const readFailure = (cause: unknown): { code: string; message: string } => {
    if (typeof cause === 'string') {
        return { code: '', message: cause };
    }

    if (typeof cause === 'object' && cause !== null) {
        const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : '';
        const message = 'message' in cause && typeof cause.message === 'string' ? cause.message : '';

        return { code, message };
    }

    return { code: '', message: '' };
};

// The Keychain commands answer one of these words; the plugin answers its own codes, and a key the system dropped as a message.
const biometricFailure = (cause: unknown): BiometricFailure => {
    const { code, message } = readFailure(cause);

    if (failureCodes.has(message)) {
        return message as BiometricFailure;
    }

    if (['userCancel', 'systemCancel', 'appCancel', 'userFallback', 'authenticationFailed', 'biometryLockout'].includes(code)) {
        return 'cancel';
    }

    if (['biometryNotEnrolled', 'passcodeNotSet'].includes(code) || /^Failed to (?:initialize the cipher|decrypt)/u.test(message)) {
        return 'gone';
    }

    return 'failed';
};

const biometricFailing = async <T>(work: () => Promise<T>) => {
    try {
        return await work();
    } catch (cause) {
        throw new Error(biometricFailure(cause), { cause });
    }
};

const unavailable = async (): Promise<never> => {
    throw new Error('unavailable');
};

// Never `allowDeviceCredential`: the device's passcode is not the wallet's password, and must not stand in for it.
const androidBiometric: PlatformBiometric = {
    kind: async () => {
        const status = await checkStatus();

        return status.isAvailable ? (biometricKinds[status.biometryType] ?? 'other') : undefined;
    },

    seal: async (password, prompt) =>
        biometricFailing(async () => (await biometricCipher(prompt, { dataToEncrypt: password, allowDeviceCredential: false })).data),

    open: async (sealed, prompt) => biometricFailing(async () => (await biometricCipher(prompt, { dataToDecrypt: sealed, allowDeviceCredential: false })).data),

    // The Keystore key is the plugin's and outlives what it sealed; the sealed copy is ours, and goes with Wallet.Biometric.
    forget: async () => undefined
};

const keychainMark = 'keychain';

const appleBiometric: PlatformBiometric = {
    kind: androidBiometric.kind,

    // Read back once while being set up: an unsigned macOS build cannot hold the item, and says so only when it is read.
    seal: async (password) =>
        biometricFailing(async () => {
            await invoke('biometric_seal', { secret: password });

            try {
                if ((await invoke<string>('biometric_open')) !== password) {
                    throw new Error('failed');
                }
            } catch (cause) {
                await invoke('biometric_forget').catch(() => undefined);

                throw cause;
            }

            return keychainMark;
        }),

    open: async () => biometricFailing(async () => invoke<string>('biometric_open')),

    forget: async () => biometricFailing(async () => invoke('biometric_forget'))
};

const noBiometric: PlatformBiometric = {
    kind: async () => undefined,
    seal: unavailable,
    open: unavailable,
    forget: async () => undefined
};

export const platform: Platform = {
    session: inertSession,
    approval: inertApproval,
    dapp: nativeDapp,

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

    // The plugin throws outside Tauri (`npm run dev`); cached because callers are on render paths.
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
    },

    get biometric() {
        const name = platform.host();

        if (name === 'android') {
            return androidBiometric;
        }

        return name === 'ios' || name === 'macos' ? appleBiometric : noBiometric;
    },

    // Listening takes the button over from the activity, so leaving the app at the root is ours to do.
    backButton: (handler) => {
        if (platform.host() !== 'android') {
            return () => undefined;
        }

        let listener: PluginListener | undefined;
        let dropped = false;

        void onBackButtonPress(() => {
            if (!handler()) {
                void exit(0);
            }
        })
            .then((held) => {
                if (dropped) {
                    void held.unregister();
                } else {
                    listener = held;
                }
            })
            .catch(() => undefined);

        return () => {
            dropped = true;

            void listener?.unregister();
        };
    }
};
