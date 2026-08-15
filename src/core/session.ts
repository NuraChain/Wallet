import { useSyncExternalStore } from 'react';

import type { Vault } from './vault';

/**
 * The unlocked vault, for as long as the app is unlocked.
 *
 * This exists because of how the wallet is opened. The secret used to be handed to the dashboard as a
 * React prop by `openPage(DashboardPage, { vault })`, which was safe: props live in memory and go
 * nowhere else. A router cannot carry a value that way — the equivalent is
 * `navigate('/dashboard', { state })`, and **route state is serialized into `history.state`**, which
 * the WebView keeps for the session and restores across a reload. A decrypted mnemonic does not belong
 * there, so it is held here instead and the route carries nothing at all.
 *
 * A module singleton rather than context state, matching theme, language, network and connection: it
 * has to be readable from a route loader, which runs outside the React tree, so the guard on the
 * dashboard route can redirect *before* rendering rather than flashing the page and then bouncing.
 * `useVault` is the in-tree view of the same value.
 *
 * Nothing here is ever persisted. Locking or logging out drops the reference and the only copy of the
 * decrypted secret goes with it.
 */
let current: Vault | undefined;

const listeners = new Set<() => void>();

/**
 * announce - Tells every subscribed component the vault changed.
 */
const announce = () =>
{
    for (const listener of listeners)
    {
        listener();
    }
};

/**
 * getVault - The unlocked vault, or `undefined` when locked.
 *
 * Also the route guard's question: a loader calls this to decide whether the dashboard may render.
 * @returns {Vault | undefined} The vault held in memory.
 */
export const getVault = () => current;

/**
 * unlockSession - Records the vault just unlocked or just imported.
 * @param {Vault} vault The decrypted key material.
 * @returns {void}
 */
export const unlockSession = (vault: Vault) =>
{
    current = vault;

    announce();
};

/**
 * lockSession - Drops the decrypted secret.
 *
 * Called by the lock button and by logout. After this the dashboard route no longer passes its guard,
 * so a stale history entry cannot be walked back into.
 * @returns {void}
 */
export const lockSession = () =>
{
    current = undefined;

    announce();
};

/**
 * subscribe - Registers a listener for `useSyncExternalStore`.
 * @param {() => void} listener Called whenever the vault changes.
 * @returns {() => void} The unsubscribe function.
 */
const subscribe = (listener: () => void) =>
{
    listeners.add(listener);

    return () =>
    {
        listeners.delete(listener);
    };
};

/**
 * useVault - The unlocked vault, as a hook.
 *
 * Returns the same object identity for as long as the session lasts, so it is safe as a dependency
 * and as a memo input — the dashboard derives its address from it on every account change.
 * @returns {Vault | undefined} The vault, or `undefined` when locked.
 */
export const useVault = () => useSyncExternalStore(subscribe, getVault, getVault);
