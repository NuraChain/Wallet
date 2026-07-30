import type { Swiper as SwiperType } from 'swiper';

import { Mnemonic } from 'ethers';
import { motion } from 'motion/react';
import { FiCheck } from 'react-icons/fi';
import { IoClose } from 'react-icons/io5';
import { Swiper, SwiperSlide } from 'swiper/react';
import { useCallback, useRef, useState } from 'react';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { HiEye, HiEyeOff, HiOutlineLockClosed } from 'react-icons/hi';

import DashboardPage from '../../page/dashboard';

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
    const [ showPassword, setShowPassword ] = useState(false);
    const [ showPassword2, setShowPassword2 ] = useState(false);

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

        const hash = await passwordHash(password);

        swiperRef.current?.slideTo(1);

        setHash(hash);

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
        <>
            <motion.div
                initial={ { opacity: 0 } }
                animate={ { opacity: 1 } }
                exit={ { opacity: 0 } }
                className='absolute z-10 size-full cursor-pointer bg-black/25 backdrop-blur-xs'
                onClick={ onClose } />

            <motion.div
                initial={ { y: '-100%' } }
                animate={ { y: '0%' } }
                exit={ { y: '-100%' } }
                transition={ { type: 'tween' } }
                className='glass-panel absolute inset-x-0 top-0 z-20 mx-2 flex h-fit max-h-full max-w-lg flex-col gap-2 overflow-y-auto overscroll-contain rounded-b-3xl px-4 pt-[env(safe-area-inset-top)] pb-4 sm:mx-auto sm:px-6 sm:pb-6'>

                <button
                    type='button'
                    onClick={ onClose }
                    className='btn-muted mt-4 flex size-10 shrink-0 items-center justify-center rounded-lg'>

                    <IoClose size={ 24 } />

                </button>

                <div className='flex flex-col'>

                    <div className='text-medium text-txt-normal sm:text-large text-center font-bold'>

                        {
                            T('Intro.ImportWallet.Title')
                        }

                    </div>

                    <div className='text-tiny text-txt-muted sm:text-small text-center'>

                        {
                            T('Intro.ImportWallet.Subtitle')
                        }

                    </div>

                </div>

                {
                    error.length > 0 &&
                    (
                        <div className='bg-txt-error/15 text-small text-txt-error mx-auto w-fit rounded-lg px-4 py-2 text-center'>

                            { error }

                        </div>
                    )
                }

                <Swiper
                    onSwiper={ onSwiper }
                    className='h-fit w-full shrink-0'>

                    <SwiperSlide style={ { display: proceed ? 'none' : '' } }>

                        <div className='flex flex-col gap-2 px-1'>

                            <label className='flex flex-col gap-2'>

                                <div className='text-tiny text-txt-muted'>

                                    {
                                        T('Intro.ImportWallet.Password')
                                    }

                                </div>

                                <div className='relative flex items-center'>

                                    <HiOutlineLockClosed className='text-txt-muted absolute left-4' size={ 20 } />

                                    <input
                                        type={ showPassword ? 'text' : 'password' }
                                        value={ password }
                                        placeholder={ T('Intro.ImportWallet.Password') }
                                        onChange={ (e) => { setPassword(e.target.value); } }
                                        className='glass-input text-small h-12 w-full rounded-lg px-12' />

                                    <button
                                        type='button'
                                        onClick={ () => { setShowPassword(!showPassword); } }
                                        className='text-txt-muted hover:text-txt-normal absolute right-4 cursor-pointer rounded-lg'>

                                        {
                                            showPassword ? <HiEyeOff size={ 18 } /> : <HiEye size={ 18 } />
                                        }

                                    </button>

                                </div>

                            </label>

                            <label className='flex flex-col gap-2'>

                                <div className='text-tiny text-txt-muted'>

                                    {
                                        T('Intro.ImportWallet.Confirm')
                                    }

                                </div>

                                <div className='relative flex items-center'>

                                    <HiOutlineLockClosed className='text-txt-muted absolute left-4' size={ 20 } />

                                    <input
                                        type={ showPassword2 ? 'text' : 'password' }
                                        value={ password2 }
                                        placeholder={ T('Intro.ImportWallet.Confirm') }
                                        onChange={ (e) => { setPassword2(e.target.value); } }
                                        className='glass-input text-small h-12 w-full rounded-lg px-12' />

                                    <button
                                        type='button'
                                        onClick={ () => { setShowPassword2(!showPassword2); } }
                                        className='text-txt-muted hover:text-txt-normal absolute right-4 cursor-pointer rounded-lg'>

                                        {
                                            showPassword2 ? <HiEyeOff size={ 18 } /> : <HiEye size={ 18 } />
                                        }

                                    </button>

                                </div>

                            </label>

                            <label className='flex min-h-10 cursor-pointer items-center gap-2 py-1'>

                                <button
                                    type='button'
                                    onClick={ () => { setAgree(!agree); } }
                                    className='glass-input flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm'>

                                    {
                                        agree && <FiCheck size={ 16 } className='text-txt-muted' />
                                    }

                                </button>

                                <div className='text-tiny text-txt-muted leading-snug'>

                                    {
                                        T('Intro.ImportWallet.Agreement')
                                    }

                                </div>

                            </label>

                            <button
                                type='button'
                                disabled={ !agree }
                                onClick={ () => { void onSubmit1(); } }
                                className={ `btn-primary mx-auto mb-2 flex h-12 w-full items-center justify-center rounded-lg px-4 py-2 sm:w-fit sm:px-8 ${ !agree ? 'cursor-not-allowed! opacity-50' : '' }` }>

                                {
                                    !loading ? T('Intro.ImportWallet.Submit1') : <AiOutlineLoading3Quarters size={ 24 } className='animate-spin' />
                                }

                            </button>

                        </div>

                    </SwiperSlide>

                    <SwiperSlide>

                        <div className='flex flex-col gap-4 px-1 py-2'>

                            <textarea
                                value={ mnemonic }
                                onChange={ (e) => { setMnemonic(e.target.value); } }
                                className='bg-base-3 text-small min-h-28 w-full resize-none rounded-xl p-3 outline-0 sm:min-h-36'
                                placeholder={ T('Intro.ImportWallet.Message') } />

                            <button
                                type='button'
                                onClick={ () => void onSubmit2() }
                                className='btn-primary mx-auto flex h-12 w-full items-center justify-center rounded-lg px-4 sm:w-fit sm:px-8'>

                                {
                                    T('Intro.ImportWallet.Submit2')
                                }

                            </button>

                        </div>

                    </SwiperSlide>

                </Swiper>

            </motion.div>
        </>
    );
}
