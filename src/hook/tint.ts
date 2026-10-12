import { useSyncExternalStore } from 'react';

import { getTint, subscribeTint } from '../core/browser';

/** The colour the site on show has asked the wallet's chrome to wear; the empty string for none. */
export const useTint = () => useSyncExternalStore(subscribeTint, getTint, getTint);
