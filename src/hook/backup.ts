import { useSyncExternalStore } from 'react';

import { getBackupDue, subscribeBackup } from '../core/backup';

/** Whether it is time to remind the user to back the wallet up. False until the store has been read. */
export const useBackupDue = () => useSyncExternalStore(subscribeBackup, getBackupDue, getBackupDue);
