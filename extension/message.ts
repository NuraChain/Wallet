/** The port a page's relay opens to the worker. One per frame, opened on its first call. */
export const providerChannel = 'nura:provider';

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

/** The relay handing that click back, which is the only thing a dock may be opened out of. */
export const dockChannel = 'nura:dock';

export const isPageMessage = (value: unknown): value is PageMessage =>
    typeof value === 'object' && value !== null && '__nura' in value && typeof (value as PageMessage).__nura === 'string';
