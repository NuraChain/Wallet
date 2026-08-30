import { argon2id } from 'hash-wasm';

import { getValue } from '../utility/storage';

const salt = new TextEncoder().encode('ApplicationSaltAt2026');

const memorySize = 65536;
const iterations = 3;
const parallelism = 1;
const hashLength = 32;

export const passwordHash = async (password: string) => argon2id({ password, salt, memorySize, iterations, parallelism, hashLength, outputType: 'hex' });

export const passwordVerify = async (password: string, expectedHash: string) => {
    const actual = await passwordHash(password);

    if (actual.length !== expectedHash.length) {
        return false;
    }

    let difference = 0;

    for (let index = 0; index < actual.length; index++) {
        difference |= actual.charCodeAt(index) ^ expectedHash.charCodeAt(index);
    }

    return difference === 0;
};

export const passwordCheck = async (password: string): Promise<'ok' | 'invalid' | 'missing'> => {
    const stored = await getValue('Wallet.Password');

    if (stored === undefined) {
        return 'missing';
    }

    return (await passwordVerify(password, stored)) ? 'ok' : 'invalid';
};

const passwordMin = 6;
const passwordMax = 32;

export const passwordIssue = (password: string, confirm: string) => {
    if (password !== confirm) {
        return 'mismatch';
    }

    if (password.length < passwordMin || password.length > passwordMax) {
        return 'length';
    }

    return undefined;
};
