import type { VaultKind } from '../../core/vault';

import { Mnemonic } from 'ethers';
import { useNavigate } from 'react-router';
import { useState } from 'react';

import WalletManager from '../../core/wallet';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Button from '../ui/button';
import IntroCredentials from './intro.credentials';
import { TextArea } from '../ui/field';
import { Sheet, SheetHeader } from '../ui/sheet';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { passwordHash } from '../../core/password';
import { unlockSession } from '../../core/session';
import { setValue, setValueEncrypted } from '../../utility/storage';
import { Horizontal, Vertical } from '../ui/stack';

const methodList: { kind: VaultKind; label: string }[] = [
    { kind: 'mnemonic', label: 'Intro.ImportWallet.MethodPhrase' },
    { kind: 'privateKey', label: 'Intro.ImportWallet.MethodKey' }
];

export default function IntroImport({ onClose }: { onClose: () => void }) {
    const navigate = useNavigate();

    const [hash, setHash] = useState('');
    const [error, setError] = useState('');
    const [secret, setSecret] = useState('');
    const [method, setMethod] = useState<VaultKind>('mnemonic');
    const [password, setPassword] = useState('');
    const [proceed, setProceed] = useState(false);
    const [importing, setImporting] = useState(false);

    const onSubmit1 = async (chosen: string) => {
        const hash2 = await passwordHash(chosen);

        setHash(hash2);

        setPassword(chosen);

        setProceed(true);
    };

    const onMethod = (kind: VaultKind) => {
        setMethod(kind);
        setSecret('');
        setError('');
    };

    const validate = () => {
        const entered = secret.trim();

        if (method === 'privateKey') {
            if (!WalletManager.ValidatePrivateKey(entered)) {
                setError(T('Intro.ImportWallet.ErrorInvalidKey'));

                return undefined;
            }

            return WalletManager.FromPrivateKey(entered).retrieve().Private;
        }

        const phrase = entered.replaceAll(/\s+/g, ' ');
        const words = phrase.split(' ');

        if (words.length !== 12 && words.length !== 24) {
            setError(T('Intro.ImportWallet.ErrorInvalidLength'));

            return undefined;
        }

        if (!Mnemonic.isValidMnemonic(phrase.normalize('NFKD'))) {
            setError(T('Intro.ImportWallet.ErrorInvalidLength'));

            return undefined;
        }

        return phrase;
    };

    const onSubmit2 = async () => {
        if (importing) {
            return;
        }

        const stored = validate();

        if (stored === undefined) {
            return;
        }

        setImporting(true);

        try {
            await setValueEncrypted('Wallet.Mnemonic', stored, password);

            await setValue('Wallet.Password', hash);

            unlockSession({ kind: method, secret: stored });

            await navigate('/dashboard', { replace: true });
        } catch {
            setError(T('Intro.ImportWallet.ErrorGenerate'));
        } finally {
            setImporting(false);
        }
    };

    return (
        <Sheet onClose={onClose}>
            <SheetHeader title={T('Intro.ImportWallet.Title')} subtitle={T('Intro.ImportWallet.Subtitle')} />

            <Alert className='mx-auto w-fit px-4 text-small' text={error} />

            {!proceed && (
                <IntroCredentials prefix='Intro.ImportWallet' submitKey='Submit1' className='px-1' submitClass='mb-2' onError={setError} onSubmit={onSubmit1} />
            )}

            {proceed && (
                <Vertical className='gap-4 px-1 py-2'>
                    <Horizontal className='gap-2'>
                        {methodList.map((item) => (
                            <Button
                                key={item.kind}
                                variant={method === item.kind ? 'primary' : 'normal'}
                                onClick={() => {
                                    onMethod(item.kind);
                                }}
                                className='h-10 min-w-0 flex-1 rounded-control text-small'
                                text={T(item.label)}
                            />
                        ))}
                    </Horizontal>

                    <TextArea
                        value={secret}
                        label={method === 'privateKey' ? T('Intro.ImportWallet.MessageKey') : T('Intro.ImportWallet.Message')}
                        dir={method === 'privateKey' ? 'ltr' : undefined}
                        onValue={setSecret}
                        className={cn('min-h-28 sm:min-h-36', method === 'privateKey' && 'break-all')}
                        placeholder={method === 'privateKey' ? T('Intro.ImportWallet.MessageKey') : T('Intro.ImportWallet.Message')}
                    />

                    {method === 'privateKey' && <Text text={T('Intro.ImportWallet.KeyNote')} />}

                    <Button
                        variant='primary'
                        size='submit'
                        loading={importing}
                        onClick={() => {
                            void onSubmit2();
                        }}
                        className='mx-auto sm:w-fit sm:px-8'
                        text={T('Intro.ImportWallet.Submit2')}
                    />
                </Vertical>
            )}
        </Sheet>
    );
}
