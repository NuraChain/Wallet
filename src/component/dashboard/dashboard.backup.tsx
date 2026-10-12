import { useEffect } from 'react';
import { X } from 'lucide-react';

import Alert from '../../ui/alert';
import Button from '../../ui/button';

import { T } from '../../utility/language';
import { useBackupDue } from '../../hook/backup';
import { closeBackupReminder, loadBackupReminder } from '../../core/backup';
import type { VaultKind } from '../../type/wallet';

/**
 * The question a self-custodial wallet has to keep asking: is there a copy of the phrase anywhere
 * but on this device?
 *
 * A new wallet is made and opened without its phrase ever being shown, so nothing else on the way
 * in asks it. It stands on the wallet page until it is closed, and comes back a week after each
 * time it was. Opening the backup from it does not close it: looking at the words is not the same
 * as having written them down, and only the user can say which happened.
 */
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
            action={<Button variant='chip' size='small' onClick={onOpen} text={T('Dashboard.Backup.Action')} />}
            trailing={
                <Button variant='muted' size='icon' title={T('Dashboard.Backup.Later')} onClick={closeBackupReminder} shrink={false} icon={<X size={16} />} />
            }
        />
    );
}
