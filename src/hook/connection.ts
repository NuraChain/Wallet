import { useSyncExternalStore } from 'react';

import { isOnline, subscribeConnection } from '../core/connection';

/**
 * Re-render the calling component whenever the network link comes or goes.
 *
 * The same shape as `useLanguage`, and for the same reason: the connection is a module singleton rather
 * than context, so a component that wants to react to it subscribes rather than reading a provider. The
 * boolean is the store's own snapshot, so React can skip the render when nothing actually changed.
 * @returns {boolean} Whether the device reports a network link.
 */
export const useOnline = (): boolean => useSyncExternalStore(subscribeConnection, isOnline);
