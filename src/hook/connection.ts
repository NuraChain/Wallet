import { useSyncExternalStore } from 'react';

import { isOnline, subscribeConnection } from '../core/connection';

export const useOnline = (): boolean => useSyncExternalStore(subscribeConnection, isOnline);
