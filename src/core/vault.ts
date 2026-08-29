import WalletManager from './wallet';

/**
 * What kind of key material the wallet was opened with.
 *
 * Once a signer exists the two are indistinguishable — same `retrieve`/`sign`/`send` surface — so this
 * only matters upstream of that, where a mnemonic can derive an unlimited number of accounts at
 * `m/44'/60'/0'/0/{index}` and a raw private key is exactly one account with no path to a second.
 */
export type VaultKind = 'mnemonic' | 'privateKey';

/**
 * The unlocked key material, and what it is.
 *
 * This is what travels through the component tree in place of the bare mnemonic string that used to,
 * so every surface that needs a signer can build one without knowing which sort of wallet it is
 * looking at, and the few that genuinely differ can ask.
 */
export interface Vault {
    kind: VaultKind;
    /** The BIP39 phrase, or the private key as it was entered. */
    secret: string;
}

/**
 * A raw secp256k1 private key as it is written: 64 hex characters, with or without the `0x`.
 *
 * Shape only — whether those 32 bytes are actually in range is `WalletManager.ValidatePrivateKey`'s
 * question, and this is just what tells a key apart from a phrase.
 */
const privateKeyShape = /^(?:0x)?[0-9a-fA-F]{64}$/u;

/**
 * readVault - Decides what a secret is by looking at it.
 *
 * The kind is derived from the material rather than stored beside it, deliberately. A marker in the
 * store would be a second source of truth able to disagree with the payload it describes, and a wallet
 * whose marker says "mnemonic" over a private key is a wallet that cannot be opened at all. The two
 * shapes cannot be confused — a BIP39 phrase is words separated by spaces, a private key is 64 hex
 * characters — so reading the answer off the secret is both cheaper and impossible to desynchronize.
 *
 * It also means every wallet imported before private keys existed reads back correctly with no
 * migration: those secrets are phrases, and they still look like phrases.
 * @param {string} secret The decrypted secret out of storage, or straight off the import form.
 * @returns {Vault} The secret paired with the kind it turned out to be.
 */
export const readVault = (secret: string): Vault => {
    const trimmed = secret.trim();

    return { kind: privateKeyShape.test(trimmed) ? 'privateKey' : 'mnemonic', secret: trimmed };
};

/**
 * vaultManager - Builds the signer for one account of this wallet.
 *
 * `index` is the BIP44 address index and is meaningful only for a mnemonic; a private key is its own
 * single account and ignores it. Callers pass the active index either way rather than branching, since
 * the two managers expose the same API.
 * @param {Vault} vault The unlocked key material.
 * @param {number} index The derivation index to open.
 * @returns {WalletManager | ReturnType<typeof WalletManager.FromPrivateKey>} A wallet manager for that account.
 */
export const vaultManager = (vault: Vault, index: number) =>
    vault.kind === 'privateKey' ? WalletManager.FromPrivateKey(vault.secret) : new WalletManager(vault.secret, index);

/**
 * vaultAddress - The public address of one account of this wallet.
 * @param {Vault} vault The unlocked key material.
 * @param {number} index The derivation index, ignored for a private key.
 * @returns {string} The checksummed address.
 */
export const vaultAddress = (vault: Vault, index: number) => vaultManager(vault, index).retrieve().Public;

/**
 * vaultDerivable - Whether this wallet can produce accounts beyond the one it opened with.
 *
 * The account switcher, and anything else offering to add an account, asks this rather than testing
 * the kind directly — a private-key wallet holds one key and there is no index that would yield
 * another, so offering the form would only ever produce an address the user cannot spend from.
 * @param {Vault} vault The unlocked key material.
 * @returns {boolean} True for a mnemonic wallet.
 */
export const vaultDerivable = (vault: Vault) => vault.kind === 'mnemonic';
