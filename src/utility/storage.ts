import { argon2id } from 'hash-wasm';

import { platform } from '../platform';

import type { StorageKey } from './storage.key';

interface EncryptedPayload {
    salt: string;
    iv: string;
    cipher: string;
    kdf?: 'argon2id';
}

export type { StorageKey };

const deriveKeyArgon2id = async (passphrase: string, salt: Uint8Array<ArrayBuffer>) => {
    const bytes = await argon2id({ password: passphrase, salt, memorySize: 65536, iterations: 3, parallelism: 1, hashLength: 32, outputType: 'binary' });

    return crypto.subtle.importKey('raw', new Uint8Array(bytes), 'AES-GCM', false, ['encrypt', 'decrypt']);
};

export const getValue = async (key: StorageKey) => platform.storage.get(key);

export const setValue = async (key: StorageKey, value: string) => platform.storage.set(key, value);

export const removeValue = async (key: StorageKey) => platform.storage.remove([key]);

export const removeValues = async (...keys: StorageKey[]) => platform.storage.remove(keys);

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
