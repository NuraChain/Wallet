import { argon2id } from 'hash-wasm';
import { load } from '@tauri-apps/plugin-store';

interface EncryptedPayload {
    salt: string;
    iv: string;
    cipher: string;
    kdf?: 'argon2id';
}

type StorageKey =
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

const storage = await load('application.bin');

const deriveKeyArgon2id = async (passphrase: string, salt: Uint8Array<ArrayBuffer>) => {
    const bytes = await argon2id({ password: passphrase, salt, memorySize: 65536, iterations: 3, parallelism: 1, hashLength: 32, outputType: 'binary' });

    return crypto.subtle.importKey('raw', new Uint8Array(bytes), 'AES-GCM', false, ['encrypt', 'decrypt']);
};

export const getValue = async (key: StorageKey) => storage.get<string>(key);

export const setValue = async (key: StorageKey, value: string) => {
    await storage.set(key, value);

    await storage.save();
};

export const removeValue = async (key: StorageKey) => {
    await storage.delete(key);

    await storage.save();
};

export const removeValues = async (...keys: StorageKey[]) => {
    await Promise.all(keys.map(async (key) => storage.delete(key)));

    await storage.save();
};

export const setValueEncrypted = async (key: StorageKey, value: string, passphrase: string) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const salt = crypto.getRandomValues(new Uint8Array(16));

    const cryptoKey = await deriveKeyArgon2id(passphrase, salt);
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(value));

    const toBase64 = (bytes: Uint8Array) => {
        let binary = '';

        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }

        return btoa(binary);
    };

    const payload: EncryptedPayload = { iv: toBase64(iv), salt: toBase64(salt), cipher: toBase64(new Uint8Array(cipher)), kdf: 'argon2id' };

    await setValue(key, JSON.stringify(payload));
};

export const getValueEncrypted = async (key: StorageKey, passphrase: string) => {
    const stored = await getValue(key);

    if (stored === undefined) {
        return undefined;
    }

    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const parsed = JSON.parse(stored) as EncryptedPayload;

    if (typeof parsed !== 'object' || !('salt' in parsed) || !('iv' in parsed) || !('cipher' in parsed)) {
        return undefined;
    }

    if (typeof parsed.salt !== 'string' || typeof parsed.iv !== 'string' || typeof parsed.cipher !== 'string') {
        return undefined;
    }

    const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

    const cryptoKey = await deriveKeyArgon2id(passphrase, fromBase64(parsed.salt));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(parsed.iv) }, cryptoKey, fromBase64(parsed.cipher));

    return new TextDecoder().decode(plain);
};
