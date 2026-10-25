import { useState } from 'react';

import Text from '../../ui/text';
import Alert from '../../ui/alert';
import Button from '../../ui/button';
import { PasswordField } from '../../ui/field';
import { Modal, ModalHeader } from '../../ui/modal';

import { T } from '../../utility/language';
import { enableBiometric } from '../../core/biometric';

const failureMap: Record<string, string> = {
    invalid: 'Dashboard.Biometric.ErrorInvalid',
    cancel: 'Dashboard.Biometric.ErrorCancel',
    gone: 'Dashboard.Biometric.ErrorFailed',
    unavailable: 'Dashboard.Biometric.ErrorUnavailable',
    failed: 'Dashboard.Biometric.ErrorFailed'
};

/** Turning biometric unlock on takes the password typed: the copy the device keeps is made from it and nothing else. */
export default function DashboardBiometric({ onEnabled, onClose }: { onEnabled: () => void; onClose: () => void }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const onConfirm = async () => {
        if (busy) {
            return;
        }

        setError('');

        if (password.trim().length === 0) {
            setError(T('Dashboard.Biometric.ErrorRequired'));

            return;
        }

        setBusy(true);

        try {
            const outcome = await enableBiometric(password, T('Dashboard.Biometric.Prompt'));

            if (outcome === 'ok') {
                setPassword('');
                onEnabled();

                return;
            }

            setError(T(failureMap[outcome]));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal onClose={busy ? () => undefined : onClose}>
            <ModalHeader title={T('Dashboard.Biometric.Title')} close={busy ? 'none' : 'icon'} onClose={onClose} />

            <Text variant='bodyMuted' text={T('Dashboard.Biometric.Note')} />

            <Alert text={error} />

            <PasswordField
                size='compact'
                label={T('Dashboard.Biometric.Password')}
                value={password}
                onValue={setPassword}
                onEnter={() => {
                    void onConfirm();
                }}
            />

            <Button
                dim
                variant='primary'
                size='action'
                disabled={busy}
                loading={busy}
                onClick={() => {
                    void onConfirm();
                }}
                mt={1}
                text={busy ? '' : T('Dashboard.Biometric.Enable')}
            />
        </Modal>
    );
}
