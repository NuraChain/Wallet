/** The browser extension's messages and store targets. */

export type Target = 'chrome' | 'edge' | 'firefox' | 'safari';

/** What the page world posts at the relay, and what the relay posts back. */
export interface PageMessage {
    __nura: 'request' | 'reply' | 'event';
    payload: unknown;
}

/** Relay to worker, over the provider port. */
export interface ProviderMessage {
    kind: 'rpc';
    payload: string;
}

/** Worker to relay: replies ride the port, events arrive as a plain runtime message. */
export interface WorkerMessage {
    kind: 'reply' | 'event';
    payload: unknown;
}

/** The worker asking the frame to spend its click on opening the wallet's panel. */
export interface DockMessage {
    kind: 'dock';
}
