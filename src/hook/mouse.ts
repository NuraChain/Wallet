import { useSyncExternalStore } from 'react';

import { getMouseOpacity, subscribeMouseOpacity } from '../core/mouse';

/** The floating mouse's opacity, as stored; it reads the setting the first time it is used. */
export const useMouseOpacity = () => useSyncExternalStore(subscribeMouseOpacity, getMouseOpacity, getMouseOpacity);
