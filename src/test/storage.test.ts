import { describe, expect, it, vi } from 'vitest';

/**
 * The recovery phrase is on disk sealed under a key Argon2id makes of the password. A change to how
 * that key is made would leave every phrase already sealed unopenable, so the first thing held here
 * is a phrase sealed by the code before the hash was moved off the page: it still has to open.
 */

const held = new Map<string, string>();

vi.mock('../platform', () => ({
    platform: {
        storage: {
            get: async (key: string) => held.get(key),
            set: async (key: string, value: string) => {
                held.set(key, value);
            }
        }
    }
}));

const { getValueEncrypted, setValueEncrypted } = await import('../utility/storage');

const phrase = 'test test test test test test test test test test test junk';

const sealedBefore =
    '{"iv":"rxDy/ireqvykx059","salt":"AjnLfddFiIOWNbuJNh3fNQ==","cipher":"KeSbwRZs42tDxaJmeHamABzxadRJ30sia+hW8jlm5hWMARU/KlugMVfDANX4I44jtKvNSwZfOuekQ1MMOhosZyAgEIDfrHpvwMF3","kdf":"argon2id"}';

describe('a value sealed under the password', () => {
    it('still opens when it was sealed before the hash moved off the page', async () => {
        held.set('Wallet.Mnemonic', sealedBefore);

        expect(await getValueEncrypted('Wallet.Mnemonic', 'correct-horse')).toBe(phrase);
    });

    it('does not open under another password', async () => {
        held.set('Wallet.Mnemonic', sealedBefore);

        await expect(getValueEncrypted('Wallet.Mnemonic', 'correct-horsf')).rejects.toThrow();
    });

    it('opens what it seals, and seals it differently every time', async () => {
        await setValueEncrypted('Wallet.Mnemonic', phrase, 'correct-horse');

        const first = held.get('Wallet.Mnemonic');

        expect(first).not.toContain('test');
        expect(await getValueEncrypted('Wallet.Mnemonic', 'correct-horse')).toBe(phrase);

        await setValueEncrypted('Wallet.Mnemonic', phrase, 'correct-horse');

        expect(held.get('Wallet.Mnemonic')).not.toBe(first);
    });

    it('is nothing where nothing was stored', async () => {
        held.clear();

        expect(await getValueEncrypted('Wallet.Mnemonic', 'correct-horse')).toBeUndefined();
    });
});
