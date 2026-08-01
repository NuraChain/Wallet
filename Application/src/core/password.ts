import { argon2id } from 'hash-wasm';

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
 * Argon2id cost parameters.
 *
 * These mirror the previous Rust `Params::new(32768, 2, 1, Some(32))` exactly — 32 MiB of memory,
 * two passes, no parallelism, 32 bytes out. Changing any of them invalidates every stored hash.
 */
const memorySize = 65536;
const iterations = 3;
const parallelism = 2;
const hashLength = 32;

/**
 * passwordHash - Derives the Argon2id hash used to verify the unlock password.
 *
 * The digest is lowercase hex of the raw 32-byte output, matching what the Rust command produced.
 * @param {string} password The plaintext password.
 * @returns {Promise<string>} The hex-encoded hash.
 */
export const passwordHash = async(password: string) => argon2id({ password, salt, memorySize, iterations, parallelism, hashLength, outputType: 'hex' });

/**
 * passwordVerify - Checks a password against a stored hash.
 *
 * The comparison runs over the full length regardless of where the first mismatch is, so it cannot
 * leak how much of a guess was correct through timing.
 * @param {string} password The plaintext password to check.
 * @param {string} expectedHash The hash previously produced by `passwordHash`.
 * @returns {Promise<boolean>} Whether the password matches.
 */
export const passwordVerify = async(password: string, expectedHash: string) =>
{
    const actual = await passwordHash(password);

    if (actual.length !== expectedHash.length)
    {
        return false;
    }

    let difference = 0;

    for (let index = 0; index < actual.length; index++)
    {
        difference |= actual.charCodeAt(index) ^ expectedHash.charCodeAt(index);
    }

    return difference === 0;
};
