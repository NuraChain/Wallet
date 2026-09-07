/**
 * The keys the wallet persists under. Split out of `storage.ts` so the platform layer can name
 * them without importing the module that depends on it.
 */
export type StorageKey =
    | 'App.Language'
    | 'App.Theme'
    | 'App.Network'
    | 'App.Networks'
    | 'Wallet.Mnemonic'
    | 'Wallet.Password'
    | 'Wallet.Name'
    | 'Wallet.Accounts'
    | 'Wallet.Active'
    | 'Wallet.Tokens'
    | 'Wallet.TokensHidden'
    | 'Browser.View'
    | 'Browser.History'
    | 'Browser.Favorites'
    | 'Browser.Connections';
