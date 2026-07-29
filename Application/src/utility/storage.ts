import { argon2id } from 'hash-wasm';
import { load } from '@tauri-apps/plugin-store';

interface EncryptedPayload { salt: string; iv: string; cipher: string; kdf?: string }

type StorageKey = 'App.Language' | 'App.Theme' | 'App.Network' | 'App.Networks' | 'Wallet.Mnemonic' | 'Wallet.Password' | 'Wallet.Name' | 'Wallet.Accounts' | 'Wallet.Active' | 'Wallet.Tokens';

const storage = await load('application.bin');

/**
 * Marks a payload whose key came from Argon2id. Absent means the original PBKDF2 format.
 */
const kdfArgon2id = 'argon2id';

/**
 * deriveKeyLegacy - The original PBKDF2-SHA256 derivation, kept only to read existing payloads.
 *
 * 102,400 iterations of PBKDF2-SHA256 is well under current guidance and, more to the point, it was
 * far cheaper to attack than the Argon2id the password verifier uses — so an attacker holding the
 * store would always have gone after this instead. New writes use `deriveKey`.
 * @param {string} passphrase - The passphrase to derive the key from
 * @param {Uint8Array<ArrayBuffer>} salt - The salt bytes used in derivation
 * @returns {Promise<CryptoKey>} The derived AES-GCM key
 */
const deriveKeyLegacy = async(passphrase: string, salt: Uint8Array<ArrayBuffer>) =>
{
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [ 'deriveKey' ]);

    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 102400, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, [ 'encrypt', 'decrypt' ]);
};

/**
 * deriveKey - Derives a non-extractable AES-GCM 256 key from a passphrase via Argon2id.
 *
 * Memory-hard by design, so a GPU or ASIC gains far less against it than against PBKDF2. Parameters
 * match the password verifier (32 MiB, two passes) so neither path is the cheap way in — the point of
 * hardening the verifier is lost if the ciphertext next to it can be ground for less.
 *
 * The salt is per-payload and random, unlike the verifier's fixed application salt.
 * @param {string} passphrase - The passphrase to derive the key from
 * @param {Uint8Array<ArrayBuffer>} salt - The salt bytes used in derivation
 * @returns {Promise<CryptoKey>} The derived AES-GCM key
 */
const deriveKey = async(passphrase: string, salt: Uint8Array<ArrayBuffer>) =>
{
    const derived = await argon2id({ password: passphrase, salt, memorySize: 32768, iterations: 2, parallelism: 1, hashLength: 32, outputType: 'binary' });

    const raw = new Uint8Array(derived);

    const cryptoKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, [ 'encrypt', 'decrypt' ]);

    // The imported key is non-extractable, but these plain copies of the key bytes are not. Wiping
    // them keeps the window in which raw key material sits in the heap as short as possible.
    raw.fill(0);
    derived.fill(0);

    return cryptoKey;
};

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
 * getValue - Retrieves a plaintext value from persistent storage
 * @param {StorageKey} key - The storage key name
 * @returns {Promise<string | undefined>} Stored string or undefined if not set
 */
export const getValue = async(key: StorageKey) => storage.get<string>(key);

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
 * isLegacyEncrypted - Whether a stored payload still uses the old PBKDF2 derivation.
 *
 * Lets a caller that already holds the passphrase re-write the value under Argon2id, so an install
 * created before the change does not stay on the weaker derivation forever.
 * @param {StorageKey} key - The storage key name
 * @returns {Promise<boolean>} True when the value exists and predates the Argon2id format.
 */
export const isLegacyEncrypted = async(key: StorageKey) =>
{
    const stored = await getValue(key);

    if (stored === undefined)
    {
        return false;
    }

    try
    {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const parsed = JSON.parse(stored) as EncryptedPayload;

        return typeof parsed === 'object' && parsed.kdf !== kdfArgon2id;
    }
    catch
    {
        return false;
    }
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

    const cryptoKey = await deriveKey(passphrase, salt);
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

    const payload: EncryptedPayload = { iv: toBase64(iv), salt: toBase64(salt), cipher: toBase64(new Uint8Array(cipher)), kdf: kdfArgon2id };

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

    // Payloads written before the Argon2id switch carry no `kdf` and still open with PBKDF2.
    const derive = parsed.kdf === kdfArgon2id ? deriveKey : deriveKeyLegacy;

    const cryptoKey = await derive(passphrase, fromBase64(parsed.salt));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(parsed.iv) }, cryptoKey, fromBase64(parsed.cipher));

    return new TextDecoder().decode(plain);
};
