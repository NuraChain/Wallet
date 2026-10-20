import { useSyncExternalStore } from 'react';

import { getDappPrompt, subscribePrompts } from '../core/dapp.prompt';

export const useDappPrompt = () => useSyncExternalStore(subscribePrompts, getDappPrompt, getDappPrompt);
