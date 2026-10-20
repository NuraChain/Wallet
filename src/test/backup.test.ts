import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const held = new Map<string, string>();

let unreadable = false;

vi.mock('../platform', () => ({
    platform: {
        storage: {
            get: async (key: string) => {
                if (unreadable) {
                    throw new Error('store unreadable');
                }

                return held.get(key);
            },
            set: async (key: string, value: string) => {
                held.set(key, value);
            }
        }
    }
}));

const day = 24 * 60 * 60 * 1000;

const start = Date.UTC(2026, 9, 13, 9, 0, 0);

const fresh = async () => import('../core/backup');

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(start);

    held.clear();

    unreadable = false;
});

afterEach(() => {
    vi.useRealTimers();
});

describe('whether it is time to ask about the backup', () => {
    it('is, when the question has never been closed', async () => {
        const { backupDue } = await fresh();

        expect(backupDue(undefined, start)).toBe(true);
    });

    it('is not, for a week after it was closed', async () => {
        const { backupDue } = await fresh();

        expect(backupDue(String(start), start)).toBe(false);
        expect(backupDue(String(start), start + 6 * day)).toBe(false);
        expect(backupDue(String(start), start + 7 * day - 1)).toBe(false);
    });

    it('is again, from a week to the millisecond', async () => {
        const { backupDue } = await fresh();

        expect(backupDue(String(start), start + 7 * day)).toBe(true);
        expect(backupDue(String(start), start + 8 * day)).toBe(true);
        expect(backupDue(String(start), start + 400 * day)).toBe(true);
    });

    it('is, when what was stored is not a time', async () => {
        const { backupDue } = await fresh();

        expect(backupDue('', start)).toBe(true);
        expect(backupDue('yesterday', start)).toBe(true);
        expect(backupDue('NaN', start)).toBe(true);
        expect(backupDue('Infinity', start)).toBe(true);
    });

    it('is, when it was closed at a time still to come: the clock has been put back', async () => {
        const { backupDue } = await fresh();

        expect(backupDue(String(start + 1), start)).toBe(true);
        expect(backupDue(String(start + 300 * day), start)).toBe(true);
    });
});

describe('the reminder on the wallet page', () => {
    it('is not shown before the store has been read', async () => {
        const { getBackupDue } = await fresh();

        expect(getBackupDue()).toBe(false);
    });

    it('is shown on a wallet that has never closed it', async () => {
        const { getBackupDue, loadBackupReminder } = await fresh();

        await loadBackupReminder();

        expect(getBackupDue()).toBe(true);
    });

    it('goes when it is closed, and the time it was closed is kept', async () => {
        const { closeBackupReminder, getBackupDue, loadBackupReminder } = await fresh();

        await loadBackupReminder();

        closeBackupReminder();

        expect(getBackupDue()).toBe(false);

        await vi.advanceTimersByTimeAsync(0);

        expect(held.get('Wallet.BackupReminder')).toBe(String(start));
    });

    it('stays away when the wallet is opened again inside the week', async () => {
        held.set('Wallet.BackupReminder', String(start));

        vi.setSystemTime(start + 6 * day);

        const { getBackupDue, loadBackupReminder } = await fresh();

        await loadBackupReminder();

        expect(getBackupDue()).toBe(false);
    });

    it('is back when the wallet is opened after the week', async () => {
        held.set('Wallet.BackupReminder', String(start));

        vi.setSystemTime(start + 7 * day);

        const { getBackupDue, loadBackupReminder } = await fresh();

        await loadBackupReminder();

        expect(getBackupDue()).toBe(true);
    });

    it('comes back by itself in a wallet left open through the week', async () => {
        const { closeBackupReminder, getBackupDue, loadBackupReminder, subscribeBackup } = await fresh();

        await loadBackupReminder();

        closeBackupReminder();

        const told = vi.fn();

        subscribeBackup(told);

        await vi.advanceTimersByTimeAsync(7 * day - 1);

        expect(getBackupDue()).toBe(false);
        expect(told).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);

        expect(getBackupDue()).toBe(true);
        expect(told).toHaveBeenCalledTimes(1);
    });

    it('is closed for another week each time, not for good', async () => {
        const { closeBackupReminder, getBackupDue, loadBackupReminder } = await fresh();

        await loadBackupReminder();

        closeBackupReminder();

        await vi.advanceTimersByTimeAsync(7 * day);

        expect(getBackupDue()).toBe(true);

        closeBackupReminder();

        expect(getBackupDue()).toBe(false);

        await vi.advanceTimersByTimeAsync(7 * day - 1);

        expect(getBackupDue()).toBe(false);

        await vi.advanceTimersByTimeAsync(1);

        expect(getBackupDue()).toBe(true);
        expect(held.get('Wallet.BackupReminder')).toBe(String(start + 7 * day));
    });

    it('tells whoever is listening only when it changes', async () => {
        const { closeBackupReminder, loadBackupReminder, subscribeBackup } = await fresh();

        const told = vi.fn();
        const stop = subscribeBackup(told);

        await loadBackupReminder();
        await loadBackupReminder();

        expect(told).toHaveBeenCalledTimes(1);

        closeBackupReminder();

        expect(told).toHaveBeenCalledTimes(2);

        stop();

        await vi.advanceTimersByTimeAsync(7 * day);

        expect(told).toHaveBeenCalledTimes(2);
    });

    it('is shown when the store cannot be read: saying nothing is the worse mistake', async () => {
        held.set('Wallet.BackupReminder', String(start));

        unreadable = true;

        const { getBackupDue, loadBackupReminder } = await fresh();

        await loadBackupReminder();

        expect(getBackupDue()).toBe(true);
    });
});
