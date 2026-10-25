import type { DappGas, DappPrompt, DappReply } from './dapp';
import type { StorageKey } from './storage';
import type { Vault } from './wallet';

export type Exporter = PlatformExporter;

export interface PlatformStorage {
    get: (key: StorageKey) => Promise<string | undefined>;
    set: (key: StorageKey, value: string) => Promise<void>;
    remove: (keys: StorageKey[]) => Promise<void>;
}

/** Each resolves to the empty string on success, or to the reason it failed. */
export interface PlatformExporter {
    saveImage: (base64Png: string, name: string) => Promise<string>;
    saveText: (text: string, name: string) => Promise<string>;
}

/** Inert in Tauri. An extension's worker is evicted when idle, so the vault is held elsewhere and expires on a deadline. */
export interface PlatformSession {
    read: () => Promise<Vault | undefined>;
    write: (vault: Vault | undefined) => Promise<void>;
    watch: (listener: (vault: Vault | undefined) => void) => () => void;

    touch: () => Promise<void>;
}

/** `origin` is stamped by the transport, never read from the payload: a page naming its own origin could spend another site's grants. */
export interface PlatformDappCall {
    label: string;
    origin: string;
    payload: string;
    respond: (reply: DappReply) => void;
}

/** `origin` is the frame the webview reports, never a name the page gave. One answer covers every kind. */
export interface PlatformSiteAsk {
    label: string;
    origin: string;
    kinds: string[];
    respond: (allowed: boolean) => void;
}

export interface PlatformDapp {
    serve: (accept: (call: PlatformDappCall) => void, onLink?: (url: string) => void, onAsk?: (ask: PlatformSiteAsk) => void) => () => void;
    emit: (label: string, body: string) => void;
}

export interface PlatformApproval {
    publish: (prompts: DappPrompt[]) => void;
    subscribe: (listener: (prompts: DappPrompt[]) => void) => () => void;
    answer: (id: string, approved: boolean, gas?: DappGas) => void;

    surface: () => void;

    dismiss: () => void;
}

export interface Platform {
    readonly storage: PlatformStorage;
    readonly session: PlatformSession;
    readonly approval: PlatformApproval;
    readonly dapp: PlatformDapp;
    readonly host: () => Host;
    readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
    readonly openUrl: (url: string) => Promise<void>;
    readonly exporter: () => PlatformExporter;
}

/** Mirrors plugin-os `Platform` rather than importing it, so the extension build carries no Tauri. */
export type Host = 'linux' | 'macos' | 'ios' | 'freebsd' | 'dragonfly' | 'netbsd' | 'openbsd' | 'solaris' | 'android' | 'windows' | 'extension' | 'unknown';
