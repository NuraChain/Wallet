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

/**
 * Everything the wallet leaves on the device. Logging out means all of it goes.
 */
const clearList = [ 'Wallet.Mnemonic', 'Wallet.Password', 'Wallet.Name', 'Wallet.Accounts', 'Wallet.Active' ] as const;

/**
 * DashboardLogout - Password-gated wallet removal.
 *
 * Logging out wipes the encrypted secret from the device, so the password is verified against the
 * stored Argon2 hash first — the same check the unlock screen runs — and only then is storage cleared.
 *
 * `kind` is only here for the warning: what the user needs in order to come back is the phrase or the
 * key they imported, and naming the wrong one is the difference between a recoverable wallet and a
 * lost one.
 * @param {object} props Component props.
 * @param {VaultKind} props.kind Which sort of secret this wallet holds.
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The logout modal.
 */
export default function DashboardLogout({ kind, onClose }: { kind: VaultKind; onClose: () => void })
{
    const navigate = useNavigate();

    const [ error, setError ] = useState('');
    const [ password, setPassword ] = useState('');
    const [ isLoading, setIsLoading ] = useState(false);

    const onConfirm = async() =>
    {
        setError('');

        if (password.trim().length === 0)
        {
            setError(T('Dashboard.Logout.ErrorRequired'));

            return;
        }

        setIsLoading(true);

        try
        {
            const outcome = await passwordCheck(password);

            // Nothing stored means there is nothing left to log out of, so the wallet is already gone.
            if (outcome === 'missing')
            {
                lockSession();

                await navigate('/intro', { replace: true });

                return;
            }

            if (outcome === 'invalid')
            {
                setError(T('Dashboard.Logout.ErrorInvalid'));

                return;
            }

            await removeValues(...clearList);

            // The cached transaction lists go with them. They are keyed by account address and sit
            // outside the wallet store, so clearing that store alone would leave one wallet's history
            // readable after the wallet itself is gone.
            invalidateHistory();
            invalidateTokenCache();

            // The decrypted secret goes with the stored one. Dropping it also closes the dashboard
            // route's guard, so the entry left behind in history cannot be walked back into.
            lockSession();

            await navigate('/intro', { replace: true });
        }
        finally
        {
            setIsLoading(false);
        }
    };

    return (
        <Modal
            scroll
            onClose={ onClose }>

            <ModalHeader
                title={ T('Dashboard.Logout.Title') }
                onClose={ onClose } />

            <Alert
                variant='warning'
                text={ kind === 'privateKey' ? T('Dashboard.Logout.MessageKey') : T('Dashboard.Logout.Message') } />

            <Alert text={ error } />

            <PasswordField
                size='compact'
                label={ T('Dashboard.Logout.Password') }
                value={ password }
                onValue={ setPassword }
                onEnter={ () => { void onConfirm(); } } />

            { /*
              * Cancel carries the emphasis and the destructive button is the quiet one: this
              * dialog exists to slow the user down, so the prominent control should be the way
              * back out rather than the one that wipes the wallet.
              */ }
            <ModalActions>

                <Button
                    variant='primary'
                    size='action'
                    onClick={ onClose }
                    text={ T('Dashboard.Logout.Cancel') } />

                <Button
                    dim
                    variant='danger'
                    size='action'
                    disabled={ isLoading }
                    onClick={ () => { void onConfirm(); } }
                    text={ isLoading ? T('Dashboard.Logout.Pending') : T('Dashboard.Logout.Confirm') } />

            </ModalActions>

        </Modal>
    );
}
