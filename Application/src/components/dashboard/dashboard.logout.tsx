import { useState } from 'react';

import IntroPage from '../../page/intro';

import Alert from '../ui/alert';
import Button from '../ui/button';
import { PasswordField } from '../ui/field';
import { Modal, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { passwordVerify } from '../../core/password';
import { openPage } from '../../utility/context';
import { getValue, removeValue } from '../../utility/storage';

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
            const storedHash = await getValue('Wallet.Password');

            if (storedHash === undefined)
            {
                openPage(IntroPage);

                return;
            }

            const isValid = await passwordVerify(password, storedHash);

            if (!isValid)
            {
                setError(T('Dashboard.Logout.ErrorInvalid'));

                return;
            }

            await removeValue('Wallet.Mnemonic');
            await removeValue('Wallet.Password');
            await removeValue('Wallet.Name');
            await removeValue('Wallet.Accounts');
            await removeValue('Wallet.Active');

            openPage(IntroPage);
        }
        finally
        {
            setIsLoading(false);
        }
    };

    return (
        <Modal
            onClose={ onClose }
            panelClass='max-h-[80vh] overflow-y-auto'>

            <ModalHeader
                title={ T('Dashboard.Logout.Title') }
                onClose={ onClose } />

            <Alert variant='warning'>

                { T('Dashboard.Logout.Message') }

            </Alert>

            {
                error.length > 0 &&
                (
                    <Alert>

                        { error }

                    </Alert>
                )
            }

            <PasswordField
                size='compact'
                label={ T('Dashboard.Logout.Password') }
                value={ password }
                onValue={ setPassword }
                onEnter={ () => { void onConfirm(); } } />

            <div className='mt-1 flex gap-2'>

                <Button
                    variant='muted'
                    size='action'
                    onClick={ onClose }
                    className='flex-1'
                    text={ T('Dashboard.Logout.Cancel') } />

                <Button
                    variant='normal'
                    size='action'
                    disabled={ isLoading }
                    onClick={ () => { void onConfirm(); } }
                    className='flex-1 text-txt-error disabled:cursor-not-allowed! disabled:opacity-60'
                    text={ isLoading ? T('Dashboard.Logout.Pending') : T('Dashboard.Logout.Confirm') } />

            </div>

        </Modal>
    );
}
