import { useSyncExternalStore } from 'react';

import { getMouseOpacity, subscribeMouseOpacity } from '../core/mouse';

export const useMouseOpacity = () => useSyncExternalStore(subscribeMouseOpacity, getMouseOpacity, getMouseOpacity);
