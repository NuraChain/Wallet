import { loadConnections } from './dapp';
import { imageCache } from './image';
import { initNetwork } from './network';
import { clearPrices } from './price';
import { lockSession } from './session';
import { clearSiteIcons } from './site.icon';
import { invalidateHistory } from './history.cache';
import { invalidateTokenCache } from './token.cache';
import { removeValues } from '../utility/storage';

import type { StorageKey } from '../type/storage';

/**
 * What deleting the wallet does with each key the app persists.
 *
 * A record rather than a list, so a key added to `StorageKey` fails the type check here until
 * somebody decides. The list logout kept let the token list, the custom networks and every site
 * the wallet had connected to outlive the wallet they belonged to — and the next wallet made on the
 * device was handed to those sites without being asked.
 *
 * Kept: how the app looks on this device. None of it says whose wallet it was.
 */
const fate: Record<StorageKey, 'erase' | 'keep'> = {
    'App.Language': 'keep',
    'App.Theme': 'keep',
    'App.Mouse': 'keep',
    'App.Network': 'erase',
    'App.Networks': 'erase',
    'Wallet.Mnemonic': 'erase',
    'Wallet.Password': 'erase',
    'Wallet.Name': 'erase',
    'Wallet.Accounts': 'erase',
    'Wallet.Active': 'erase',
    'Wallet.Tokens': 'erase',
    'Wallet.TokensHidden': 'erase',
    'Browser.View': 'erase',
    'Browser.History': 'erase',
    'Browser.Favorites': 'erase',
    'Browser.Connections': 'erase'
};

// oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
export const erasedKeys = (Object.keys(fate) as StorageKey[]).filter((key) => fate[key] === 'erase');

let erased = false;

/**
 * Delete the wallet from this device: the encrypted phrase, the password hash, the accounts, the
 * tokens, the networks it added, the browser's history, favourites and connected sites, and every
 * cache that holds an address, a balance or a site it visited.
 *
 * Storage goes before the lock. Locking first sends the dashboard back through the launch route,
 * which would still find a phrase on disk and ask for the password of a wallet being deleted.
 */
export const eraseWallet = async () => {
    await removeValues(...erasedKeys);

    invalidateHistory();
    invalidateTokenCache();
    clearPrices();
    clearSiteIcons();

    await imageCache.clear().catch(() => undefined);

    // Read back from the storage just emptied, so this context lets go of the networks and the
    // connected sites it still holds in memory rather than carrying them into the next wallet.
    await Promise.all([initNetwork(), loadConnections()]);

    erased = true;

    lockSession();
};

/** Whether the wallet was just deleted. Answered once, for the first screen that follows it. */
export const takeErased = () => {
    const was = erased;

    erased = false;

    return was;
};
