import { useState } from 'react';

import WalletManager from '../../core/wallet';

import DashboardPage from '../../page/dashboard';

import Alert from '../ui/alert';
import Button from '../ui/button';
import Spinner from '../ui/spinner';
import Checkbox from '../ui/checkbox';
import { PasswordField } from '../ui/field';
import { Sheet, SheetHeader } from '../ui/sheet';

import { T } from '../../utility/language';
import { passwordHash } from '../../core/password';
import { openPage } from '../../utility/context';
import { setValue, setValueEncrypted } from '../../utility/storage';

export default function IntroWallet({ onClose }: { onClose: () => void })
{
    const [ error, setError ] = useState('');
    const [ agree, setAgree ] = useState(false);
    const [ password, setPassword ] = useState('');
    const [ loading, setLoading ] = useState(false);
    const [ password2, setPassword2 ] = useState('');

    const onCreateWallet = async() =>
    {
        if (loading)
        {
            return;
        }

        setLoading(true);

        try
        {
            if (password !== password2)
            {
                setError(T('Intro.CreateWallet.ErrorMismatch'));

                return;
            }

            if (password.length <= 5 || password.length >= 33)
            {
                setError(T('Intro.CreateWallet.ErrorLength'));

                return;
            }

            const mnemonic = WalletManager.Generate();

            if (mnemonic === undefined)
            {
                setError(T('Intro.CreateWallet.ErrorGenerate'));

                return;
            }

            const hash = await passwordHash(password);

            await setValueEncrypted('Wallet.Mnemonic', mnemonic, password);

            await setValue('Wallet.Password', hash);

            openPage(DashboardPage, { mnemonic });
        }
        finally
        {
            setLoading(false);
        }
    };

    return (
        <Sheet onClose={ onClose }>

            <SheetHeader
                title={ T('Intro.CreateWallet.Title') }
                subtitle={ T('Intro.CreateWallet.Subtitle') } />

            {
                error.length > 0 &&
                (
                    <Alert className='mx-auto w-fit px-4 text-small'>

                        { error }

                    </Alert>
                )
            }

            <PasswordField
                label={ T('Intro.CreateWallet.Password') }
                value={ password }
                onValue={ setPassword }
                className='rounded-lg' />

            <PasswordField
                label={ T('Intro.CreateWallet.Confirm') }
                value={ password2 }
                onValue={ setPassword2 }
                className='rounded-lg' />

            <Checkbox
                checked={ agree }
                onToggle={ () => { setAgree(!agree); } }>

                { T('Intro.CreateWallet.Agreement') }

            </Checkbox>

            <Button
                variant='primary'
                disabled={ !agree }
                onClick={ () => { void onCreateWallet(); } }
                className={ `mx-auto h-12 w-full shrink-0 rounded-lg px-4 py-2 sm:w-fit sm:px-8 ${ !agree ? 'cursor-not-allowed! opacity-50' : '' }` }>

                {
                    !loading ? T('Intro.CreateWallet.Submit') : <Spinner size={ 24 } />
                }

            </Button>

        </Sheet>
    );
}
