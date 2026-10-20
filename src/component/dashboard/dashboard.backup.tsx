import { useEffect } from 'react';
import { X } from 'lucide-react';

import Alert from '../../ui/alert';
import Button from '../../ui/button';

import { T } from '../../utility/language';
import { useBackupDue } from '../../hook/backup';
import { closeBackupReminder, loadBackupReminder } from '../../core/backup';
import type { VaultKind } from '../../type/wallet';

/** Opening the backup does not close this: seeing the words is not writing them down. */
export default function DashboardBackup({ kind, onOpen }: { kind: VaultKind; onOpen: () => void }) {
    const due = useBackupDue();

    useEffect(() => {
        void loadBackupReminder();
    }, []);

    const message = kind === 'privateKey' ? T('Dashboard.Backup.MessageKey') : T('Dashboard.Backup.Message');

    return (
        <Alert
            variant='warning'
            size='comfortable'
            text={due ? message : ''}
            action={<Button variant='warning' size='small' onClick={onOpen} text={T('Dashboard.Backup.Action')} />}
            trailing={
                <Button variant='notice' size='icon' title={T('Dashboard.Backup.Later')} onClick={closeBackupReminder} shrink={false} icon={<X size={16} />} />
            }
        />
    );
}
