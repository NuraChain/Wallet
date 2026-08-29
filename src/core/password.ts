import { argon2id } from 'hash-wasm';

import { getValue } from '../utility/storage';

/**
 * Fixed application-wide salt.
 *
 * A per-user random salt would be stronger, but the stored hash only ever guards this one device's
 * local unlock, and a random salt would have to be persisted next to the hash anyway. The value is
 * byte-identical to the `APP_SALT` the Rust command used, so hashes written by older builds still
 * verify against this implementation.
 */
const salt = new TextEncoder().encode('ApplicationSaltAt2026');

/**
 * Argon2id cost parameters: 64 MiB of memory, three passes, no parallelism, 32 bytes out.
 *
 * These no longer match the Rust `Params::new(32768, 2, 1, Some(32))` the stored hashes were written
 * under — memory and passes have both been raised since. Changing any of them invalidates every
 * stored hash, so a wallet created before the change cannot be unlocked until verification learns to
 * read the parameters a hash was written with.
 */
const memorySize = 65536;
const iterations = 3;
const parallelism = 1;
const hashLength = 32;

/**
 * passwordHash - Derives the Argon2id hash used to verify the unlock password.
 *
 * The digest is lowercase hex of the raw 32-byte output, matching what the Rust command produced.
 * @param {string} password The plaintext password.
 * @returns {Promise<string>} The hex-encoded hash.
 */
export const passwordHash = async (password: string) => argon2id({ password, salt, memorySize, iterations, parallelism, hashLength, outputType: 'hex' });

/**
 * passwordVerify - Checks a password against a stored hash.
 *
 * The comparison runs over the full length regardless of where the first mismatch is, so it cannot
 * leak how much of a guess was correct through timing.
 * @param {string} password The plaintext password to check.
 * @param {string} expectedHash The hash previously produced by `passwordHash`.
 * @returns {Promise<boolean>} Whether the password matches.
 */
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

/**
 * passwordCheck - Checks a password against the hash this device has stored.
 *
 * The unlock screen, the logout dialog and the recovery-phrase reveal each read the stored hash and
 * ran the comparison themselves. They only ever disagreed on what to do about it, so the reading and
 * the comparing live here and the branching stays with them: `missing` means there is no wallet on
 * this device to unlock, which is a different situation from a wrong password.
 * @param {string} password The plaintext password to check.
 * @returns {Promise<'ok' | 'invalid' | 'missing'>} The outcome.
 */
export const passwordCheck = async (password: string): Promise<'ok' | 'invalid' | 'missing'> => {
    const stored = await getValue('Wallet.Password');

    if (stored === undefined) {
        return 'missing';
    }

    return (await passwordVerify(password, stored)) ? 'ok' : 'invalid';
};

/**
 * The password rules the two wallet-creation flows enforce: the confirmation has to match, and the
 * password has to be between 6 and 32 characters.
 */
const passwordMin = 6;
const passwordMax = 32;

/**
 * passwordIssue - Reports what is wrong with a new password, if anything.
 *
 * Creating a wallet and importing one applied these two rules in two places, which is one place too
 * many for a rule that decides what a user can never change later.
 * @param {string} password The chosen password.
 * @param {string} confirm The confirmation field.
 * @returns {'mismatch' | 'length' | undefined} The first rule broken, or `undefined` when it passes.
 */
export const passwordIssue = (password: string, confirm: string) => {
    if (password !== confirm) {
        return 'mismatch';
    }

    if (password.length < passwordMin || password.length > passwordMax) {
        return 'length';
    }

    return undefined;
};
