import { getValue, setValue } from '../utility/storage';

/** How long the reminder stays away once it has been closed. */
export const backupGap = 7 * 24 * 60 * 60 * 1000;

/**
 * Whether it is time to ask if the wallet has been backed up, given when the question was last
 * closed (as stored: milliseconds, in a string) and what the time is now.
 *
 * It is time when it has never been closed, and a week after each time it was. A stored value that
 * is not a time, or is one still to come — the clock was put back — counts as never: asking once
 * too often costs a tap, and staying quiet on the strength of a bad value could cost the wallet.
 */
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

/* Hidden until the store has been read: a reminder closed yesterday must not show for a moment
   every time the dashboard opens. */
let due = false;

let timer: ReturnType<typeof setTimeout> | undefined;

const listeners = new Set<() => void>();

const settle = (stored: string | undefined) => {
    clearTimeout(timer);

    timer = undefined;

    const now = Date.now();
    const next = backupDue(stored, now);

    // A wallet left open — in the tray, for days — is asked again when the week is up, not only
    // the next time it is unlocked.
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

/** Read when the reminder was last closed. Called as the dashboard opens; a store that cannot be read is one that says nothing. */
export const loadBackupReminder = async () => {
    settle(await getValue('Wallet.BackupReminder').catch(() => undefined));
};

/** The user closed the reminder: it is put away for a week from now. */
export const closeBackupReminder = () => {
    const stored = String(Date.now());

    settle(stored);

    // If the write fails the reminder is back at the next unlock, which is the safe way to fail.
    void setValue('Wallet.BackupReminder', stored).catch(() => undefined);
};

export const getBackupDue = () => due;

export const subscribeBackup = (listener: () => void) => {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
};
