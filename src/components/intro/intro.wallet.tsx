import { useState } from 'react';
import { useNavigate } from 'react-router';

import WalletManager from '../../core/wallet';

import Alert from '../ui/alert';
import IntroCredentials from './intro.credentials';
import { Sheet, SheetHeader } from '../ui/sheet';

import { T } from '../../utility/language';
import { passwordHash } from '../../core/password';
import { unlockSession } from '../../core/session';
import { setValue, setValueEncrypted } from '../../utility/storage';

export default function IntroWallet({ onClose }: { onClose: () => void })
{
    const navigate = useNavigate();

    const [ error, setError ] = useState('');

    const onCreateWallet = async(password: string) =>
    {
        const mnemonic = WalletManager.Generate();

        if (mnemonic === undefined)
        {
            setError(T('Intro.CreateWallet.ErrorGenerate'));

            return;
        }

        const hash = await passwordHash(password);

        await setValueEncrypted('Wallet.Mnemonic', mnemonic, password);

        await setValue('Wallet.Password', hash);

        unlockSession({ kind: 'mnemonic', secret: mnemonic });

        await navigate('/dashboard', { replace: true });
    };

    return (
        <Sheet onClose={ onClose }>

            <SheetHeader
                title={ T('Intro.CreateWallet.Title') }
                subtitle={ T('Intro.CreateWallet.Subtitle') } />

            <Alert
                className='mx-auto w-fit px-4 text-small'
                text={ error } />

            <IntroCredentials
                prefix='Intro.CreateWallet'
                submitKey='Submit'
                className='shrink-0'
                onError={ setError }
                onSubmit={ onCreateWallet } />

        </Sheet>
    );
}
