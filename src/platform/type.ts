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
 * The frame a browser draws the wallet in — Chromium's side panel, Gecko's sidebar, Safari's
 * popup. Which one it is, and when it opens, is the extension's own business; what the app needs
 * from it is the one thing no browser offers around an extension document, which is a way out.
 *
 * A Tauri window has a title bar of its own doing, so this is inert there.
 */
export interface PlatformPanel {
    /** Whether this document is drawn in the browser's dock, which already frames it. */
    docked: () => boolean;

    /** Shut the frame this document is drawn in. */
    close: () => void;
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
