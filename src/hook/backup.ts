import { useSyncExternalStore } from 'react';

import { getBackupDue, subscribeBackup } from '../core/backup';

/** False until the store has been read. */
export const useBackupDue = () => useSyncExternalStore(subscribeBackup, getBackupDue, getBackupDue);
