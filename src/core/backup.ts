import { getValue, setValue } from '../utility/storage';

export const backupGap = 7 * 24 * 60 * 60 * 1000;

/** A stored value that is not a time, or lies in the future, counts as never closed: asking too often is the safe failure. */
export const backupDue = (stored: string | undefined, now: number) => {
    if (stored === undefined) {
        return true;
    }

    const closed = Number(stored);

    if (!Number.isFinite(closed) || closed > now) {
        return true;
    }

    return now - closed >= backupGap;
};

/* Hidden until the store is read, so a closed reminder never flashes as the dashboard opens. */
let due = false;

let timer: ReturnType<typeof setTimeout> | undefined;

const listeners = new Set<() => void>();

const settle = (stored: string | undefined) => {
    clearTimeout(timer);

    timer = undefined;

    const now = Date.now();
    const next = backupDue(stored, now);

    // A wallet left open for days is asked again when the week is up.
    if (!next) {
        timer = setTimeout(
            () => {
                settle(stored);
            },
            Number(stored) + backupGap - now
        );
    }

    if (next === due) {
        return;
    }

    due = next;

    for (const listener of listeners) {
        listener();
    }
};

export const loadBackupReminder = async () => {
    settle(await getValue('Wallet.BackupReminder').catch(() => undefined));
};

export const closeBackupReminder = () => {
    const stored = String(Date.now());

    settle(stored);

    // A failed write brings the reminder back at the next unlock, the safe way to fail.
    void setValue('Wallet.BackupReminder', stored).catch(() => undefined);
};

export const getBackupDue = () => due;

export const subscribeBackup = (listener: () => void) => {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
};
