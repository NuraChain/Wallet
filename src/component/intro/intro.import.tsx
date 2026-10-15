import { Mnemonic } from 'ethers';
import { useNavigate } from 'react-router';
import { useState } from 'react';

import WalletManager from '../../core/wallet';

import Text from '../../ui/text';
import Alert from '../../ui/alert';
import Button from '../../ui/button';
import IntroCredentials from './intro.credentials';
import { TextArea } from '../../ui/field';
import { PhraseInput } from '../../ui/secret';
import { Sheet, SheetHeader } from '../../ui/sheet';

import { T } from '../../utility/language';
import { passwordHash } from '../../core/password';
import { unlockSession } from '../../core/session';
import { setValue, setValueEncrypted } from '../../utility/storage';
import { Horizontal, Vertical } from '../../ui/stack';
import { enterPhrase, phraseLengths, resizePhrase } from '../../core/phrase';
import type { VaultKind } from '../../type/wallet';

const methodList: { kind: VaultKind; label: string }[] = [
    { kind: 'mnemonic', label: 'Intro.ImportWallet.MethodPhrase' },
    { kind: 'privateKey', label: 'Intro.ImportWallet.MethodKey' }
];

const blank = () => resizePhrase([], 12);

export default function IntroImport({ onClose }: { onClose: () => void }) {
    const navigate = useNavigate();

    const [hash, setHash] = useState('');
    const [error, setError] = useState('');
    const [words, setWords] = useState(blank);
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
        setWords(blank());
        setError('');
    };

    const onWord = (index: number, text: string) => {
        const next = enterPhrase(words, index, text);

        if (next === undefined) {
            setError(T('Intro.ImportWallet.ErrorWordCount'));

            return;
        }

        setWords(next);
        setError('');
    };

    const validate = () => {
        if (method === 'privateKey') {
            const entered = secret.trim();

            if (!WalletManager.ValidatePrivateKey(entered)) {
                setError(T('Intro.ImportWallet.ErrorInvalidKey'));

                return undefined;
            }

            return WalletManager.FromPrivateKey(entered).retrieve().Private;
        }

        if (words.some((word) => word.length === 0)) {
            setError(T('Intro.ImportWallet.ErrorMissingWords'));

            return undefined;
        }

        const phrase = words.join(' ');

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

            <Alert size='banner' mx='auto' width='fit' text={error} />

            {!proceed && <IntroCredentials prefix='Intro.ImportWallet' submitKey='Submit1' inset submitGap onError={setError} onSubmit={onSubmit1} />}

            {proceed && (
                <Vertical gap={4} px={1} py={2}>
                    <Horizontal gap={2}>
                        {methodList.map((item) => (
                            <Button
                                key={item.kind}
                                variant={method === item.kind ? 'primary' : 'normal'}
                                onClick={() => {
                                    onMethod(item.kind);
                                }}
                                size='action'
                                squeeze='x'
                                grow
                                text={T(item.label)}
                            />
                        ))}
                    </Horizontal>

                    {method === 'mnemonic' && (
                        <Vertical gap={2}>
                            <Horizontal gap={2} align='center'>
                                <Text grow text={T('Intro.ImportWallet.Message')} />

                                {phraseLengths.map((length) => (
                                    <Button
                                        key={length}
                                        variant={words.length === length ? 'primary' : 'chip'}
                                        onClick={() => {
                                            setWords(resizePhrase(words, length));
                                            setError('');
                                        }}
                                        size='small'
                                        shrink={false}
                                        text={T(`Intro.ImportWallet.Words${length}`)}
                                    />
                                ))}
                            </Horizontal>

                            <PhraseInput words={words} onEnter={onWord} />

                            <Text variant='caption' text={T('Intro.ImportWallet.PasteHint')} />
                        </Vertical>
                    )}

                    {method === 'privateKey' && (
                        <>
                            <TextArea
                                value={secret}
                                label={T('Intro.ImportWallet.MessageKey')}
                                dir='ltr'
                                onValue={setSecret}
                                tall
                                breaks='all'
                                placeholder={T('Intro.ImportWallet.MessageKey')}
                            />

                            <Text text={T('Intro.ImportWallet.KeyNote')} />
                        </>
                    )}

                    <Button
                        variant='primary'
                        size='cta'
                        loading={importing}
                        onClick={() => {
                            void onSubmit2();
                        }}
                        text={T('Intro.ImportWallet.Submit2')}
                    />
                </Vertical>
            )}
        </Sheet>
    );
}
