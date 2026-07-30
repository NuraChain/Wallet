import { useState } from 'react';
import { FaQuestion } from 'react-icons/fa';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { motion, AnimatePresence } from 'motion/react';
import { HiEye, HiEyeOff, HiOutlineLockClosed } from 'react-icons/hi';

import IntroPage from './intro';
import DashboardPage from './dashboard';

import { T } from '../utility/language';
import { passwordVerify } from '../core/password';
import { openPage } from '../utility/context';
import { getValue, getValueEncrypted, isConvertedEncrypted, setValueEncrypted } from '../utility/storage';

export default function UnlockPage()
{
    const [ error, setError ] = useState('');
    const [ password, setPassword ] = useState('');
    const [ showHint, setShowHint ] = useState(false);
    const [ isLoading, setIsLoading ] = useState(false);
    const [ showPassword, setShowPassword ] = useState(false);

    const onUnlock = async() =>
    {
        setError('');

        if (password.trim().length === 0)
        {
            setError(T('Unlock.ErrorRequired'));

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
                setError(T('Unlock.ErrorInvalid'));

                return;
            }

            const mnemonic = await getValueEncrypted('Wallet.Mnemonic', password);

            if (mnemonic === undefined)
            {
                setError(T('Unlock.ErrorMissing'));

                return;
            }

            // Converge a device that ran the Argon2id build back onto the current derivation, so the
            // compatibility path in storage stops being load-bearing after one successful unlock.
            if (await isConvertedEncrypted('Wallet.Mnemonic'))
            {
                await setValueEncrypted('Wallet.Mnemonic', mnemonic, password);
            }

            openPage(DashboardPage, { mnemonic });
        }
        catch
        {
            // Decryption throws on a bad key or a corrupted payload. Without this the rejection went
            // nowhere and the button simply re-enabled, which reads as the app ignoring the tap.
            setError(T('Unlock.ErrorMissing'));
        }
        finally
        {
            setIsLoading(false);
        }
    };

    return (
        <motion.div
            initial={ { opacity: 0 } }
            animate={ { opacity: 1 } }
            transition={ { type: 'tween' } }
            className='bg-base-1 flex size-full items-center justify-center px-4'>

            <div className='glass-panel flex w-full max-w-md flex-col gap-4 rounded-3xl p-6'>

                <div className='flex items-center justify-between gap-2'>

                    <div>

                        <div className='text-large text-txt-normal font-semibold'>

                            { T('Unlock.Title') }

                        </div>

                        <div className='text-tiny text-txt-muted'>

                            { T('Unlock.Subtitle') }

                        </div>

                    </div>

                    <div className='relative z-20'>

                        <button
                            type='button'
                            onClick={ () => { setShowHint((value) => !value); } }
                            className='btn-muted flex size-10 shrink-0 items-center justify-center rounded-lg'>

                            <FaQuestion size={ 18 } />

                        </button>

                        <AnimatePresence>

                            {
                                showHint &&
                                (
                                    <motion.div
                                        initial={ { opacity: 0, scale: 0.95, y: -4 } }
                                        animate={ { opacity: 1, scale: 1, y: 0 } }
                                        exit={ { opacity: 0, scale: 0.95, y: -4 } }
                                        transition={ { duration: 0.15 } }
                                        className='glass-panel text-tiny text-txt-normal absolute inset-e-0 top-12 w-56 origin-top rounded-xl p-3 text-start'>

                                        { T('Unlock.Recovery') }

                                    </motion.div>
                                )
                            }

                        </AnimatePresence>

                    </div>

                </div>

                {
                    showHint &&
                    (
                        <div
                            className='fixed inset-0 z-10'
                            onClick={ () => { setShowHint(false); } } />
                    )
                }

                {
                    error.length > 0 &&
                    (
                        <div className='bg-txt-error/10 text-small text-txt-error mt-2 rounded-xl px-3 py-2 text-center'>

                            { error }

                        </div>
                    )
                }

                <label className='flex flex-col gap-2'>

                    <div className='text-tiny text-txt-muted'>

                        { T('Unlock.Password') }

                    </div>

                    <div className='relative flex items-center'>

                        <HiOutlineLockClosed className='text-txt-muted absolute left-4' size={ 18 } />

                        <input
                            value={ password }
                            placeholder={ T('Unlock.Password') }
                            type={ showPassword ? 'text' : 'password' }
                            onChange={ (event) => { setPassword(event.target.value); } }
                            // eslint-disable-next-line @typescript-eslint/strict-void-return
                            onKeyDown={ (event) => event.key === 'Enter' && void onUnlock() }
                            className='glass-input text-small h-12 w-full rounded-xl px-12' />

                        <button
                            type='button'
                            onClick={ () => { setShowPassword((value) => !value); } }
                            className='text-txt-muted absolute right-4 rounded-lg'>

                            {
                                showPassword ? <HiEyeOff size={ 18 } /> : <HiEye size={ 18 } />
                            }

                        </button>

                    </div>

                </label>

                <button
                    type='button'
                    dir='rtl'
                    disabled={ isLoading }
                    onClick={ () => { void onUnlock(); } }
                    className='btn-primary mx-auto flex h-12 w-fit items-center justify-center gap-2 rounded-xl px-8 py-2 disabled:cursor-not-allowed! disabled:opacity-60'>

                    {
                        // Argon2id runs 32 MiB over two passes, which is a visible pause on a phone.
                        // Without a moving indicator the button just looks dead while it works.
                        isLoading && <AiOutlineLoading3Quarters size={ 16 } className='shrink-0 animate-spin' />
                    }

                    {
                        isLoading ? T('Unlock.Loading') : T('Unlock.Submit')
                    }

                </button>

            </div>

        </motion.div>
    );
}
