import { platform } from '../platform';

import type { Vault } from '../type/wallet';

let current: Vault | undefined;

const listeners = new Set<() => void>();

const announce = () => {
    for (const listener of listeners) {
        listener();
    }
};

export const getVault = () => current;

/** Awaited once per context before anything reads the vault, which keeps `getVault()` synchronous. */
export const restoreSession = async () => {
    current = await platform.session.read();

    announce();
};

export const unlockSession = (vault: Vault) => {
    current = vault;

    announce();

    void platform.session.write(vault);
};

export const lockSession = () => {
    current = undefined;

    announce();

    void platform.session.write(undefined);
};

/** Called on the user's own actions, never on reads, or the wallet would never lock. */
export const touchSession = () => {
    void platform.session.touch();
};

export const subscribeVault = (listener: () => void) => {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
};

// Changed elsewhere: another window, or the worker locking on its deadline.
platform.session.watch((vault) => {
    current = vault;

    announce();
});
