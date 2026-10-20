export type Target = 'chrome' | 'edge' | 'firefox' | 'safari';

export interface PageMessage {
    __nura: 'request' | 'reply' | 'event';
    payload: unknown;
}

export interface ProviderMessage {
    kind: 'rpc';
    payload: string;
}

/** Replies ride the port; events arrive as a plain runtime message. */
export interface WorkerMessage {
    kind: 'reply' | 'event';
    payload: unknown;
}

/** The worker asking the frame to spend its click on opening the wallet's panel. */
export interface DockMessage {
    kind: 'dock';
}
