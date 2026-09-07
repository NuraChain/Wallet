import { useSyncExternalStore } from 'react';

import { getVault, subscribeVault } from '../core/session';

/** The unlocked vault, or undefined while the wallet is locked. */
export const useVault = () => useSyncExternalStore(subscribeVault, getVault, getVault);
