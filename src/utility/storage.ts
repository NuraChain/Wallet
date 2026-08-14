import { argon2id } from 'hash-wasm';
import { isTauri } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';

interface EncryptedPayload { salt: string; iv: string; cipher: string; kdf?: 'argon2id' }

type StorageKey = 'App.Language' | 'App.Theme' | 'App.Network' | 'App.Networks' | 'Wallet.Mnemonic' | 'Wallet.Password' | 'Wallet.Name' | 'Wallet.Accounts' | 'Wallet.Active' | 'Wallet.Tokens' | 'Browser.View' | 'Browser.History' | 'Browser.Favorites';

/**
 * The four calls this module makes of whatever is holding the keys.
 *
 * Deliberately the shape the store plugin already has rather than a shape of this module's choosing,
 * so the Tauri half is the plugin itself with nothing wrapped around it and only the web half is code.
 */
interface Backend
{
    get: (key: string) => Promise<string | undefined>;
    set: (key: string, value: string) => Promise<void>;
    delete: (key: string) => Promise<unknown>;
    save: () => Promise<void>;
}

/**
 * `localStorage`, wearing that shape, for a plain browser tab.
 *
 * Served outside a Tauri window there is no store plugin and no `application.bin`, and awaiting `load`
 * at module scope rejected — which left this module unresolved and every importer of it, which is most
 * of the app, never evaluated. A blank window with no diagnostic.
 *
 * `localStorage` rather than IndexedDB because the whole wallet is a dozen string keys: synchronous,
 * no schema, no migration, no open-request dance. `save` is a no-op since every write is already
 * durable, so the batched `removeValues` is one write there too by not being anything.
 *
 * This is the same exposure the desktop store has — both sit in plaintext next to the app, which is
 * why the mnemonic is encrypted before it reaches either and why nothing else stored here is secret.
 */
const webStorage: Backend =
{
    get: async(key: string) => Promise.resolve(localStorage.getItem(key) ?? undefined),
    set: async(key: string, value: string) => { localStorage.setItem(key, value); return Promise.resolve(); },
    delete: async(key: string) => { localStorage.removeItem(key); return Promise.resolve(true); },
    save: async() => Promise.resolve()
};

// The plugin is still loaded eagerly inside Tauri, so the desktop and Android paths keep the exact
// timing they had: storage is open before any importer runs. `isTauri()` reads a global and cannot
// throw, so the branch is safe to take before the plugin is ever touched.
const storage: Backend = isTauri() ? await load('application.bin') : webStorage;

/**
 * deriveKeyArgon2id - Derives a non-extractable AES-GCM 256 key from a passphrase and salt via Argon2id
 *
 * The mnemonic is the actual secret, so its KDF must be at least as strong as the unlock hash in
 * `core/password.ts`. The cost parameters are identical to that hash, but the salt is the per-blob
 * random value generated in `setValueEncrypted` rather than the fixed application-wide one.
 * @param {string} passphrase - The passphrase to derive the key from
 * @param {Uint8Array<ArrayBuffer>} salt - The salt bytes used in derivation
 * @returns {Promise<CryptoKey>} The derived AES-GCM key
 */
const deriveKeyArgon2id = async(passphrase: string, salt: Uint8Array<ArrayBuffer>) =>
{
    const bytes = await argon2id({ password: passphrase, salt, memorySize: 65536, iterations: 3, parallelism: 1, hashLength: 32, outputType: 'binary' });

    return crypto.subtle.importKey('raw', new Uint8Array(bytes), 'AES-GCM', false, [ 'encrypt', 'decrypt' ]);
};

/**
 * getValue - Retrieves a plaintext value from persistent storage
 * @param {StorageKey} key - The storage key name
 * @returns {Promise<string | undefined>} Stored string or undefined if not set
 */
export const getValue = async(key: StorageKey) => storage.get(key);

/**
 * setValue - Stores a plaintext value in persistent storage
 * @param {StorageKey} key - The storage key name
 * @param {string} value - The plaintext string value to store
 * @returns {Promise<void>} Resolves after value is saved
 */
export const setValue = async(key: StorageKey, value: string) =>
{
    await storage.set(key, value);

    await storage.save();
};

/**
 * removeValue - Deletes a value from persistent storage.
 * @param {StorageKey} key - The storage key name
 * @returns {Promise<void>} Resolves after the key is removed
 */
export const removeValue = async(key: StorageKey) =>
{
    await storage.delete(key);

    await storage.save();
};

/**
 * removeValues - Deletes several values and writes the file once.
 *
 * Logging out clears five keys at once. Calling `removeValue` for each meant five separate saves of
 * the same file, and the wallet is half-deleted between any two of them — this leaves one write, so
 * the store either still has the wallet or has none of it.
 * @param {...StorageKey} keys - The storage key names
 * @returns {Promise<void>} Resolves once the file has been written
 */
export const removeValues = async(...keys: StorageKey[]) =>
{
    await Promise.all(keys.map(async(key) => storage.delete(key)));

    await storage.save();
};

/**
 * setValueEncrypted - Encrypts a value with a fresh salt/IV and a passphrase-derived AES-GCM key, then stores it.
 *
 * The passphrase itself is never written to storage, only the salt, IV and ciphertext — so the
 * stored blob is useless to anyone without the passphrase, unlike `setValue`.
 * @param {StorageKey} key - The storage key name
 * @param {string} value - The plaintext string value to encrypt and store
 * @param {string} passphrase - The passphrase used to derive the encryption key
 * @returns {Promise<void>} Resolves after the encrypted value is saved
 */
export const setValueEncrypted = async(key: StorageKey, value: string, passphrase: string) =>
{
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const salt = crypto.getRandomValues(new Uint8Array(16));

    const cryptoKey = await deriveKeyArgon2id(passphrase, salt);
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(value));

    const toBase64 = (bytes: Uint8Array) =>
    {
        let binary = '';

        for (const byte of bytes)
        {
            binary += String.fromCharCode(byte);
        }

        return btoa(binary);
    };

    const payload: EncryptedPayload = { iv: toBase64(iv), salt: toBase64(salt), cipher: toBase64(new Uint8Array(cipher)), kdf: 'argon2id' };

    await setValue(key, JSON.stringify(payload));
};

/**
 * getValueEncrypted - Decrypts a value previously stored with `setValueEncrypted`.
 *
 * AES-GCM's authentication tag doubles as an integrity check, so a wrong passphrase or
 * tampered/corrupted storage both surface as a thrown error rather than garbage output.
 * @param {StorageKey} key - The storage key name
 * @param {string} passphrase - The passphrase used to derive the decryption key
 * @returns {Promise<string | undefined>} Decrypted string, or undefined if nothing is stored
 */
export const getValueEncrypted = async(key: StorageKey, passphrase: string) =>
{
    const stored = await getValue(key);

    if (stored === undefined)
    {
        return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const parsed = JSON.parse(stored) as EncryptedPayload;

    if (typeof parsed !== 'object' || !('salt' in parsed) || !('iv' in parsed) || !('cipher' in parsed))
    {
        return undefined;
    }

    if (typeof parsed.salt !== 'string' || typeof parsed.iv !== 'string' || typeof parsed.cipher !== 'string')
    {
        return undefined;
    }

    const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

    const cryptoKey = await deriveKeyArgon2id(passphrase, fromBase64(parsed.salt));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(parsed.iv) }, cryptoKey, fromBase64(parsed.cipher));

    return new TextDecoder().decode(plain);
};
