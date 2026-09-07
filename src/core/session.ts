import { platform } from '../platform';

import type { Vault } from './vault';

let current: Vault | undefined;

const listeners = new Set<() => void>();

const announce = () => {
    for (const listener of listeners) {
        listener();
    }
};

export const getVault = () => current;

/**
 * Read the session back from wherever the platform keeps it. Awaited once per context — the app's
 * startup, the worker's — before anything reaches for the vault, which is what lets `getVault()`
 * stay synchronous for the render and signing paths that call it.
 */
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

/** Push the idle deadline out, where there is one. Called on the user's own actions, not on reads. */
export const touchSession = () => {
    void platform.session.touch();
};

export const subscribeVault = (listener: () => void) => {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
};

// Somewhere else changed it: a second window, or the worker locking on its deadline.
platform.session.watch((vault) => {
    current = vault;

    announce();
});
