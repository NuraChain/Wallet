import type { PageMessage } from '../src/type/extension';

/** The port a page's relay opens to the worker. One per frame, opened on its first call. */
export const providerChannel = 'nura:provider';

/** The relay handing that click back, which is the only thing a dock may be opened out of. */
export const dockChannel = 'nura:dock';

export const isPageMessage = (value: unknown): value is PageMessage =>
    typeof value === 'object' && value !== null && '__nura' in value && typeof (value as PageMessage).__nura === 'string';
