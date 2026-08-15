import type { Swiper as SwiperType } from 'swiper';
import type { VaultKind } from '../../core/vault';

import { Mnemonic } from 'ethers';
import { useNavigate } from 'react-router';
import { Swiper, SwiperSlide } from 'swiper/react';
import { useCallback, useRef, useState } from 'react';

import WalletManager from '../../core/wallet';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Button from '../ui/button';
import IntroCredentials from './intro.credentials';
import { Sheet, SheetHeader } from '../ui/sheet';

import { T } from '../../utility/language';
import { passwordHash } from '../../core/password';
import { unlockSession } from '../../core/session';
import { setValue, setValueEncrypted } from '../../utility/storage';
import { Horizontal, Vertical } from '../ui/stack';

/**
 * The two things that can be pasted in, in the order they are offered.
 *
 * A phrase is first because it is what most wallets hand out and what restores every account; a key
 * restores the one account it is, which is what `KeyNote` says under the field.
 */
const methodList: { kind: VaultKind; label: string }[] =
[
    { kind: 'mnemonic', label: 'Intro.ImportWallet.MethodPhrase' },
    { kind: 'privateKey', label: 'Intro.ImportWallet.MethodKey' }
];

export default function IntroImport({ onClose }: { onClose: () => void })
{
    const navigate = useNavigate();

    const swiperRef = useRef<SwiperType>(undefined);

    const [ hash, setHash ] = useState('');
    const [ error, setError ] = useState('');
    const [ secret, setSecret ] = useState('');
    const [ method, setMethod ] = useState<VaultKind>('mnemonic');
    const [ password, setPassword ] = useState('');
    const [ proceed, setProceed ] = useState(false);

    const onSwiper = useCallback((swiper: SwiperType) =>
    {
        swiperRef.current = swiper;
    }, [ ]);

    const onSubmit1 = async(chosen: string) =>
    {
        const hash2 = await passwordHash(chosen);

        swiperRef.current?.slideTo(1);

        setHash(hash2);

        setPassword(chosen);

        setProceed(true);
    };

    /**
     * onMethod - Switches which sort of secret the field is asking for.
     *
     * The field is cleared along with the error: what was typed for one is never valid as the other,
     * and leaving a half-typed phrase behind under a "Private Key" heading reads as the app having
     * kept something it should not have.
     * @param {VaultKind} kind The method the user picked.
     * @returns {void}
     */
    const onMethod = (kind: VaultKind) =>
    {
        setMethod(kind);
        setSecret('');
        setError('');
    };

    /**
     * validate - Checks the entered secret and returns it in the form it should be stored in.
     *
     * Both branches normalize rather than storing the raw field: a phrase keeps its words but loses
     * the stray whitespace a paste brings with it, and a key comes back `0x`-prefixed and lowercase
     * whichever way it was written. What is stored is then exactly what `readVault` will read back.
     * @returns {string | undefined} The secret to persist, or `undefined` once the error is set.
     */
    const validate = () =>
    {
        const entered = secret.trim();

        if (method === 'privateKey')
        {
            if (!WalletManager.ValidatePrivateKey(entered))
            {
                setError(T('Intro.ImportWallet.ErrorInvalidKey'));

                return undefined;
            }

            return WalletManager.FromPrivateKey(entered).retrieve().Private;
        }

        const phrase = entered.replace(/\s+/g, ' ');
        const words = phrase.split(' ');

        if (words.length !== 12 && words.length !== 24)
        {
            setError(T('Intro.ImportWallet.ErrorInvalidLength'));

            return undefined;
        }

        if (!Mnemonic.isValidMnemonic(phrase.normalize('NFKD')))
        {
            setError(T('Intro.ImportWallet.ErrorInvalidLength'));

            return undefined;
        }

        return phrase;
    };

    const onSubmit2 = async() =>
    {
        const stored = validate();

        if (stored === undefined)
        {
            return;
        }

        await setValueEncrypted('Wallet.Mnemonic', stored, password);

        await setValue('Wallet.Password', hash);

        unlockSession({ kind: method, secret: stored });

        await navigate('/dashboard', { replace: true });
    };

    return (
        <Sheet onClose={ onClose }>

            <SheetHeader
                title={ T('Intro.ImportWallet.Title') }
                subtitle={ T('Intro.ImportWallet.Subtitle') } />

            <Alert
                className='mx-auto w-fit px-4 text-small'
                text={ error } />

            <Swiper
                onSwiper={ onSwiper }
                className='h-fit w-full shrink-0'>

                <SwiperSlide style={ { display: proceed ? 'none' : '' } }>

                    <IntroCredentials
                        prefix='Intro.ImportWallet'
                        submitKey='Submit1'
                        className='px-1'
                        submitClass='mb-2'
                        onError={ setError }
                        onSubmit={ onSubmit1 } />

                </SwiperSlide>

                <SwiperSlide>

                    <Vertical className='gap-4 px-1 py-2'>

                        { /*
                          * A pair of buttons rather than a tab strip: there are two of them and they
                          * swap the field below rather than the whole screen, so the lighter control
                          * is the honest one.
                          */ }
                        <Horizontal className='gap-2'>

                            {
                                methodList.map((item) => (
                                    <Button
                                        key={ item.kind }
                                        variant={ method === item.kind ? 'primary' : 'muted' }
                                        onClick={ () => { onMethod(item.kind); } }
                                        className='h-10 min-w-0 flex-1 rounded-lg text-small'
                                        text={ T(item.label) } />
                                ))
                            }

                        </Horizontal>

                        { /*
                          * One field for both, but a key is a single unbroken token that must not be
                          * reordered by the paragraph direction, so it is pinned to LTR and set in the
                          * mono face the rest of the app uses for addresses.
                          */ }
                        <textarea
                            value={ secret }
                            dir={ method === 'privateKey' ? 'ltr' : undefined }
                            onChange={ (event) => { setSecret(event.target.value); } }
                            className={ `min-h-28 w-full resize-none rounded-xl bg-base-3 p-3 text-small outline-0 sm:min-h-36 ${ method === 'privateKey' ? 'font-mono break-all' : '' }` }
                            placeholder={ method === 'privateKey' ? T('Intro.ImportWallet.MessageKey') : T('Intro.ImportWallet.Message') } />

                        {
                            method === 'privateKey' &&
                            (
                                <Text text={ T('Intro.ImportWallet.KeyNote') } />
                            )
                        }

                        <Button
                            variant='primary'
                            onClick={ () => { void onSubmit2(); } }
                            className='mx-auto h-12 w-full rounded-lg px-4 sm:w-fit sm:px-8'
                            text={ T('Intro.ImportWallet.Submit2') } />

                    </Vertical>

                </SwiperSlide>

            </Swiper>

        </Sheet>
    );
}
