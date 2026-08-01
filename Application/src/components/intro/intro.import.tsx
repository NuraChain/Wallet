import type { Swiper as SwiperType } from 'swiper';

import { Mnemonic } from 'ethers';
import { Swiper, SwiperSlide } from 'swiper/react';
import { useCallback, useRef, useState } from 'react';

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

export default function IntroImport({ onClose }: { onClose: () => void })
{
    const swiperRef = useRef<SwiperType>(undefined);

    const [ hash, setHash ] = useState('');
    const [ error, setError ] = useState('');
    const [ agree, setAgree ] = useState(false);
    const [ mnemonic, setMnemonic ] = useState('');
    const [ password, setPassword ] = useState('');
    const [ proceed, setProceed ] = useState(false);
    const [ loading, setLoading ] = useState(false);
    const [ password2, setPassword2 ] = useState('');

    const onSwiper = useCallback((swiper: SwiperType) =>
    {
        swiperRef.current = swiper;
    }, [ ]);

    const onSubmit1 = async() =>
    {
        if (loading)
        {
            return;
        }

        if (password !== password2)
        {
            setError(T('Intro.ImportWallet.ErrorMismatch'));

            return;
        }

        if (password.length <= 5 || password.length >= 33)
        {
            setError(T('Intro.ImportWallet.ErrorLength'));

            return;
        }

        setError('');
        setLoading(true);

        const hash2 = await passwordHash(password);

        swiperRef.current?.slideTo(1);

        setHash(hash2);

        setProceed(true);

        setLoading(false);
    };

    const onSubmit2 = async() =>
    {
        const mnemonic2 = mnemonic.trim().replace(/\s+/g, ' ').split(' ');

        if (mnemonic2.length !== 12 && mnemonic2.length !== 24)
        {
            setError(T('Intro.ImportWallet.ErrorInvalidLength'));

            return;
        }

        if (!Mnemonic.isValidMnemonic(mnemonic.trim().replace(/\s+/g, ' ').normalize('NFKD')))
        {
            setError(T('Intro.ImportWallet.ErrorInvalidLength'));

            return;
        }

        await setValueEncrypted('Wallet.Mnemonic', mnemonic, password);

        await setValue('Wallet.Password', hash);

        openPage(DashboardPage, { mnemonic });
    };

    return (
        <Sheet onClose={ onClose }>

            <SheetHeader
                title={ T('Intro.ImportWallet.Title') }
                subtitle={ T('Intro.ImportWallet.Subtitle') } />

            {
                error.length > 0 &&
                (
                    <Alert
                        className='mx-auto w-fit px-4 text-small'
                        text={ error } />
                )
            }

            <Swiper
                onSwiper={ onSwiper }
                className='h-fit w-full shrink-0'>

                <SwiperSlide style={ { display: proceed ? 'none' : '' } }>

                    <div className='flex flex-col gap-2 px-1'>

                        <PasswordField
                            label={ T('Intro.ImportWallet.Password') }
                            value={ password }
                            onValue={ setPassword }
                            className='rounded-lg' />

                        <PasswordField
                            label={ T('Intro.ImportWallet.Confirm') }
                            value={ password2 }
                            onValue={ setPassword2 }
                            className='rounded-lg' />

                        <Checkbox
                            checked={ agree }
                            onToggle={ () => { setAgree(!agree); } }
                            text={ T('Intro.ImportWallet.Agreement') } />

                        <Button
                            variant='primary'
                            disabled={ !agree }
                            onClick={ () => { void onSubmit1(); } }
                            className={ `mx-auto mb-2 h-12 w-full rounded-lg px-4 py-2 sm:w-fit sm:px-8 ${ !agree ? 'cursor-not-allowed! opacity-50' : '' }` }>

                            {
                                !loading ? T('Intro.ImportWallet.Submit1') : <Spinner size={ 24 } />
                            }

                        </Button>

                    </div>

                </SwiperSlide>

                <SwiperSlide>

                    <div className='flex flex-col gap-4 px-1 py-2'>

                        <textarea
                            value={ mnemonic }
                            onChange={ (e) => { setMnemonic(e.target.value); } }
                            className='min-h-28 w-full resize-none rounded-xl bg-base-3 p-3 text-small outline-0 sm:min-h-36'
                            placeholder={ T('Intro.ImportWallet.Message') } />

                        <Button
                            variant='primary'
                            onClick={ () => void onSubmit2() }
                            className='mx-auto h-12 w-full rounded-lg px-4 sm:w-fit sm:px-8'
                            text={ T('Intro.ImportWallet.Submit2') } />

                    </div>

                </SwiperSlide>

            </Swiper>

        </Sheet>
    );
}
