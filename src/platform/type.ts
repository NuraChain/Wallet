import type { DappReply } from '../core/dapp';
import type { DappPrompt } from '../core/dapp.prompt';
import type { Vault } from '../core/vault';
import type { Host } from '../utility/platform.type';
import type { StorageKey } from '../utility/storage.key';

/** Durable key/value storage. Values are always strings — callers stringify their own shapes. */
export interface PlatformStorage {
    get: (key: StorageKey) => Promise<string | undefined>;
    set: (key: StorageKey, value: string) => Promise<void>;
    remove: (keys: StorageKey[]) => Promise<void>;
}

/**
 * Writing a file out to wherever the host keeps the user's own files. Both answers are the empty
 * string on success and a reason on failure, which is what the phrase screen puts on the page.
 */
export interface PlatformExporter {
    saveImage: (base64Png: string, name: string) => Promise<string>;
    saveText: (text: string, name: string) => Promise<string>;
}

/**
 * Where the unlocked vault lives between reads.
 *
 * In a Tauri window it lives in a module variable and dies with the process, so there is nothing
 * to hold: the implementation there is inert. A browser extension has no such process — its
 * worker is evicted after about thirty seconds idle — so the vault has to survive somewhere the
 * worker does not, and be taken away again on a deadline rather than on a window closing.
 */
export interface PlatformSession {
    read: () => Promise<Vault | undefined>;
    write: (vault: Vault | undefined) => Promise<void>;
    watch: (listener: (vault: Vault | undefined) => void) => () => void;

    /** Push the idle deadline out. Inert where the session ends with the process. */
    touch: () => Promise<void>;
}

/**
 * One provider call, as the transport hands it over.
 *
 * `origin` is the security boundary of the whole feature and is never read from the payload: on
 * desktop Rust stamps it from the webview's own URL, in an extension it comes off the port's
 * sender. A page that could name its own origin could spend another site's grants.
 */
export interface PlatformDappCall {
    label: string;
    origin: string;
    payload: string;
    respond: (reply: DappReply) => void;
}

/** How provider calls reach the wallet, and how unsolicited events reach a page. */
export interface PlatformDapp {
    serve: (accept: (call: PlatformDappCall) => void, onLink?: (url: string) => void) => () => void;
    emit: (label: string, body: string) => void;
}

/**
 * Getting a question in front of the user, when the context that asks it is not the context that
 * can draw it.
 *
 * A Tauri window asks and answers in the same place, so all of this is inert there. An extension
 * asks in a worker that has no UI at all, and the window that can draw the question may not even
 * be open — so the queue is published for it to read, and it answers back by name.
 */
export interface PlatformApproval {
    publish: (prompts: DappPrompt[]) => void;
    subscribe: (listener: (prompts: DappPrompt[]) => void) => () => void;
    answer: (id: string, approved: boolean) => void;

    /** Make sure there is somewhere the user can see the queue. */
    surface: () => void;

    /** Nothing is waiting any more. */
    dismiss: () => void;
}

/**
 * The browser's own docked frame — Chromium's side panel, Gecko's sidebar. It draws the same
 * document the popup does, in a place the browser holds open while the user goes on clicking the
 * page, which is the one thing a popup cannot do: it is dismissed as soon as it loses focus.
 *
 * A Tauri window already stays open, so there is no second surface to move into and all of this
 * is inert there.
 */
export interface PlatformPanel {
    /** Whether there is one to open from here, and this document is not already it. */
    available: () => boolean;

    /**
     * Open it. Nothing may be awaited between the click and this call — both engines refuse a
     * panel that is not opened straight out of a user gesture — so it answers nothing.
     */
    open: () => void;
}

/**
 * Everything the wallet needs from the thing it is running inside — a Tauri window today, a
 * browser extension next. One implementation per target, picked by the `#platform-impl` alias, so
 * a build never carries another target's code.
 */
export interface Platform {
    readonly storage: PlatformStorage;
    readonly session: PlatformSession;
    readonly approval: PlatformApproval;
    readonly dapp: PlatformDapp;
    readonly panel: PlatformPanel;
    readonly host: () => Host;
    readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
    readonly openUrl: (url: string) => Promise<void>;
    readonly exporter: () => PlatformExporter;
}
