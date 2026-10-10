import { useState } from 'react';
import { useNavigate } from 'react-router';

import Alert from '../../ui/alert';
import Button from '../../ui/button';
import { PasswordField } from '../../ui/field';
import { Modal, ModalActions, ModalHeader } from '../../ui/modal';

import { T } from '../../utility/language';
import { eraseWallet } from '../../core/erase';
import { passwordCheck } from '../../core/password';
import { lockSession } from '../../core/session';
import { closeBrowserLayers } from '../../core/browser';
import type { VaultKind } from '../../type/wallet';

export default function DashboardDelete({ kind, onClose }: { kind: VaultKind; onClose: () => void }) {
    const navigate = useNavigate();

    const [error, setError] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const onConfirm = async () => {
        setError('');

        if (password.trim().length === 0) {
            setError(T('Dashboard.Delete.ErrorRequired'));

            return;
        }

        setIsLoading(true);

        try {
            const outcome = await passwordCheck(password);

            if (outcome === 'missing') {
                lockSession();

                await navigate('/intro', { replace: true });

                return;
            }

            if (outcome === 'invalid') {
                setError(T('Dashboard.Delete.ErrorInvalid'));

                return;
            }

            closeBrowserLayers();

            await eraseWallet();

            await navigate('/intro', { replace: true });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal scroll onClose={onClose}>
            <ModalHeader title={T('Dashboard.Delete.Title')} onClose={onClose} />

            <Alert variant='warning' text={kind === 'privateKey' ? T('Dashboard.Delete.MessageKey') : T('Dashboard.Delete.Message')} />

            <Alert text={error} />

            <PasswordField
                size='compact'
                label={T('Dashboard.Delete.Password')}
                value={password}
                onValue={setPassword}
                onEnter={() => {
                    void onConfirm();
                }}
            />

            <ModalActions>
                <Button variant='primary' size='action' onClick={onClose} text={T('Dashboard.Delete.Cancel')} />

                <Button
                    dim
                    variant='danger'
                    size='action'
                    loading={isLoading}
                    onClick={() => {
                        void onConfirm();
                    }}
                    text={T('Dashboard.Delete.Confirm')}
                />
            </ModalActions>
        </Modal>
    );
}
