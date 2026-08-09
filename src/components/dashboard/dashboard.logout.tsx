import { useState } from 'react';

import IntroPage from '../../page/intro';

import Alert from '../ui/alert';
import Button from '../ui/button';
import { PasswordField } from '../ui/field';
import { Modal, ModalActions, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { passwordCheck } from '../../core/password';
import { openPage } from '../../utility/context';
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
 * Logging out wipes the encrypted mnemonic from the device, so the password is verified against the
 * stored Argon2 hash first — the same check the unlock screen runs — and only then is storage cleared.
 * @param {object} props Component props.
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The logout modal.
 */
export default function DashboardLogout({ onClose }: { onClose: () => void })
{
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
                openPage(IntroPage);

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

            openPage(IntroPage);
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
                text={ T('Dashboard.Logout.Message') } />

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
                    variant='danger'
                    size='action'
                    disabled={ isLoading }
                    onClick={ () => { void onConfirm(); } }
                    className='disabled:opacity-60'
                    text={ isLoading ? T('Dashboard.Logout.Pending') : T('Dashboard.Logout.Confirm') } />

            </ModalActions>

        </Modal>
    );
}
