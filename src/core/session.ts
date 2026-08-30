import { useSyncExternalStore } from 'react';

import type { Vault } from './vault';

let current: Vault | undefined;

const listeners = new Set<() => void>();

const announce = () => {
    for (const listener of listeners) {
        listener();
    }
};

export const getVault = () => current;

export const unlockSession = (vault: Vault) => {
    current = vault;

    announce();
};

export const lockSession = () => {
    current = undefined;

    announce();
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
};

export const useVault = () => useSyncExternalStore(subscribe, getVault, getVault);
