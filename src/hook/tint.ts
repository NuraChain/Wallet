import { useSyncExternalStore } from 'react';

import { getTint, subscribeTint } from '../core/browser';

export const useTint = () => useSyncExternalStore(subscribeTint, getTint, getTint);
