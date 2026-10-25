import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Biometric unlock opens the wallet only with the real password, and a copy it can no longer trust is switched off.

const held = new Map<string, string>();

const device = {
    kind: 'fingerprint' as 'fingerprint' | undefined,
    // What the next open answers: the password released, or the failure the platform reports.
    release: { password: '' } as { password: string } | { failure: string },
    sealed: [] as string[],
    forgotten: 0
};

vi.mock('../platform', () => ({
    platform: {
        storage: {
            get: async (key: string) => held.get(key),
            set: async (key: string, value: string) => {
                held.set(key, value);
            },
            remove: async (keys: string[]) => {
                for (const key of keys) {
                    held.delete(key);
                }
            }
        },
        session: {
            read: async () => undefined,
            write: async () => undefined,
            watch: () => () => undefined,
            touch: async () => undefined
        },
        biometric: {
            kind: async () => device.kind,
            seal: async (password: string) => {
                device.sealed.push(password);

                return `sealed:${password}`;
            },
            open: async () => {
                if ('failure' in device.release) {
                    throw new Error(device.release.failure);
                }

                return device.release.password;
            },
            forget: async () => {
                device.forgotten += 1;
            }
        }
    }
}));

const { biometricEnabled, enableBiometric, unlockWithBiometric } = await import('../core/biometric');
const { passwordHash } = await import('../core/password');
const { getVault, lockSession } = await import('../core/session');
const { setValueEncrypted } = await import('../utility/storage');

const password = 'correct-horse-battery';
const phrase = 'test test test test test test test test test test test junk';

let wallet: Map<string, string>;

beforeAll(async () => {
    held.set('Wallet.Password', await passwordHash(password));

    await setValueEncrypted('Wallet.Mnemonic', phrase, password);

    wallet = new Map(held);
}, 30_000);

beforeEach(() => {
    held.clear();

    for (const [key, value] of wallet) {
        held.set(key, value);
    }

    lockSession();

    device.kind = 'fingerprint';
    device.release = { password };
    device.sealed = [];
    device.forgotten = 0;
});

describe('turning biometric unlock on', () => {
    it('keeps a copy only of the password that opens the wallet', async () => {
        await expect(enableBiometric('not-the-password', 'Unlock')).resolves.toBe('invalid');

        expect(device.sealed).toEqual([]);
        await expect(biometricEnabled()).resolves.toBe(false);

        await expect(enableBiometric(password, 'Unlock')).resolves.toBe('ok');

        expect(device.sealed).toEqual([password]);
        expect(held.get('Wallet.Biometric')).toBe(`sealed:${password}`);
    }, 30_000);
});

describe('unlocking with biometrics', () => {
    beforeEach(() => {
        held.set('Wallet.Biometric', `sealed:${password}`);
    });

    it('opens the wallet with the password the device released', async () => {
        await expect(unlockWithBiometric('Unlock')).resolves.toBe('ok');

        expect(getVault()).toEqual({ kind: 'mnemonic', secret: phrase });
    }, 30_000);

    it('stays on after a cancel, for the next try', async () => {
        device.release = { failure: 'cancel' };

        await expect(unlockWithBiometric('Unlock')).resolves.toBe('cancel');

        expect(getVault()).toBeUndefined();
        await expect(biometricEnabled()).resolves.toBe(true);
        expect(device.forgotten).toBe(0);
    });

    it('turns itself off when the device has dropped its copy', async () => {
        device.release = { failure: 'gone' };

        await expect(unlockWithBiometric('Unlock')).resolves.toBe('gone');

        expect(getVault()).toBeUndefined();
        await expect(biometricEnabled()).resolves.toBe(false);
        expect(device.forgotten).toBe(1);
    });

    it('turns itself off when the copy no longer opens the wallet', async () => {
        device.release = { password: 'an-old-password' };

        await expect(unlockWithBiometric('Unlock')).resolves.toBe('gone');

        expect(getVault()).toBeUndefined();
        await expect(biometricEnabled()).resolves.toBe(false);
    }, 30_000);

    it('does nothing at all when it was never turned on', async () => {
        held.delete('Wallet.Biometric');

        await expect(unlockWithBiometric('Unlock')).resolves.toBe('off');

        expect(getVault()).toBeUndefined();
    });
});
