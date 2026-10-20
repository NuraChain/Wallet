import { useSyncExternalStore } from 'react';

import { getVault, subscribeVault } from '../core/session';

export const useVault = () => useSyncExternalStore(subscribeVault, getVault, getVault);
