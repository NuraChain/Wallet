import { useState } from 'react';
import { motion } from 'motion/react';
import { FiCheck } from 'react-icons/fi';
import { IoClose } from 'react-icons/io5';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { HiEye, HiEyeOff, HiOutlineLockClosed } from 'react-icons/hi';

import WalletManager from '../../core/wallet';

import DashboardPage from '../../page/dashboard';

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
    const [ showPassword, setShowPassword ] = useState(false);
    const [ showPassword2, setShowPassword2 ] = useState(false);

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

                    <div className='text-center text-medium font-bold text-txt-normal sm:text-large'>

                        {
                            T('Intro.CreateWallet.Title')
                        }

                    </div>

                    <div className='text-center text-tiny text-txt-muted sm:text-small'>

                        {
                            T('Intro.CreateWallet.Subtitle')
                        }

                    </div>

                </div>

                {
                    error.length > 0 &&
                    (
                        <div className='mx-auto w-fit rounded-lg bg-txt-error/15 px-4 py-2 text-center text-small text-txt-error'>

                            { error }

                        </div>
                    )
                }

                <label className='flex flex-col gap-2'>

                    <div className='text-tiny text-txt-muted'>

                        {
                            T('Intro.CreateWallet.Password')
                        }

                    </div>

                    <div className='relative flex items-center'>

                        <HiOutlineLockClosed className='absolute left-4 text-txt-muted' size={ 20 } />

                        <input
                            type={ showPassword ? 'text' : 'password' }
                            value={ password }
                            placeholder={ T('Intro.CreateWallet.Password') }
                            onChange={ (e) => { setPassword(e.target.value); } }
                            className='glass-input h-12 w-full rounded-lg px-12 text-small' />

                        <button
                            type='button'
                            onClick={ () => { setShowPassword(!showPassword); } }
                            className='absolute right-4 cursor-pointer rounded-lg text-txt-muted hover:text-txt-normal'>

                            {
                                showPassword ? <HiEyeOff size={ 18 } /> : <HiEye size={ 18 } />
                            }

                        </button>

                    </div>

                </label>

                <label className='flex flex-col gap-2'>

                    <div className='text-tiny text-txt-muted'>

                        {
                            T('Intro.CreateWallet.Confirm')
                        }

                    </div>

                    <div className='relative flex items-center'>

                        <HiOutlineLockClosed className='absolute left-4 text-txt-muted' size={ 20 } />

                        <input
                            type={ showPassword2 ? 'text' : 'password' }
                            value={ password2 }
                            placeholder={ T('Intro.CreateWallet.Confirm') }
                            onChange={ (e) => { setPassword2(e.target.value); } }
                            className='glass-input h-12 w-full rounded-lg px-12 text-small' />

                        <button
                            type='button'
                            onClick={ () => { setShowPassword2(!showPassword2); } }
                            className='absolute right-4 cursor-pointer rounded-lg text-txt-muted hover:text-txt-normal'>

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

                    <div className='text-tiny leading-snug text-txt-muted'>

                        {
                            T('Intro.CreateWallet.Agreement')
                        }

                    </div>

                </label>

                <button
                    type='button'
                    disabled={ !agree }
                    onClick={ () => { void onCreateWallet(); } }
                    className={ `btn-primary mx-auto flex h-12 w-full shrink-0 items-center justify-center rounded-lg px-4 py-2 sm:w-fit sm:px-8 ${ !agree ? 'cursor-not-allowed! opacity-50' : '' }` }>

                    {
                        !loading ? T('Intro.CreateWallet.Submit') : <AiOutlineLoading3Quarters size={ 24 } className='animate-spin' />
                    }

                </button>

            </motion.div>
        </>
    );
}
