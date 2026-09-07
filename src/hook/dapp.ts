import { useSyncExternalStore } from 'react';

import { getDappPrompt, subscribePrompts } from '../core/dapp.prompt';

/** The prompt at the head of the queue, or undefined when the user is not being asked anything. */
export const useDappPrompt = () => useSyncExternalStore(subscribePrompts, getDappPrompt, getDappPrompt);
