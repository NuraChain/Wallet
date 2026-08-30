import type { VaultKind } from '../../core/vault';

import { useState } from 'react';
import { useNavigate } from 'react-router';

import Alert from '../ui/alert';
import Button from '../ui/button';
import { PasswordField } from '../ui/field';
import { Modal, ModalActions, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { passwordCheck } from '../../core/password';
import { lockSession } from '../../core/session';
import { removeValues } from '../../utility/storage';
import { invalidateHistory } from '../../core/history.cache';
import { invalidateTokenCache } from '../../core/token.cache';

const clearList = ['Wallet.Mnemonic', 'Wallet.Password', 'Wallet.Name', 'Wallet.Accounts', 'Wallet.Active'] as const;

export default function DashboardLogout({ kind, onClose }: { kind: VaultKind; onClose: () => void }) {
    const navigate = useNavigate();

    const [error, setError] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const onConfirm = async () => {
        setError('');

        if (password.trim().length === 0) {
            setError(T('Dashboard.Logout.ErrorRequired'));

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
                setError(T('Dashboard.Logout.ErrorInvalid'));

                return;
            }

            await removeValues(...clearList);

            invalidateHistory();
            invalidateTokenCache();

            lockSession();

            await navigate('/intro', { replace: true });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal scroll onClose={onClose}>
            <ModalHeader title={T('Dashboard.Logout.Title')} onClose={onClose} />

            <Alert variant='warning' text={kind === 'privateKey' ? T('Dashboard.Logout.MessageKey') : T('Dashboard.Logout.Message')} />

            <Alert text={error} />

            <PasswordField
                size='compact'
                label={T('Dashboard.Logout.Password')}
                value={password}
                onValue={setPassword}
                onEnter={() => {
                    void onConfirm();
                }}
            />

            <ModalActions>
                <Button variant='primary' size='action' onClick={onClose} text={T('Dashboard.Logout.Cancel')} />

                <Button
                    dim
                    variant='danger'
                    size='action'
                    loading={isLoading}
                    onClick={() => {
                        void onConfirm();
                    }}
                    text={T('Dashboard.Logout.Confirm')}
                />
            </ModalActions>
        </Modal>
    );
}
