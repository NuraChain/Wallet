import { useState } from 'react';
import { motion } from 'motion/react';
import { IoClose } from 'react-icons/io5';
import { FiAlertTriangle } from 'react-icons/fi';
import { HiEye, HiEyeOff, HiOutlineLockClosed } from 'react-icons/hi';

import IntroPage from '../../page/intro';

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
    const [ showPassword, setShowPassword ] = useState(false);

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
        <>
            <motion.div
                initial={ { opacity: 0 } }
                animate={ { opacity: 1 } }
                exit={ { opacity: 0 } }
                className='absolute z-30 size-full cursor-pointer bg-black/25 backdrop-blur-xs'
                onClick={ onClose } />

            <div className='absolute inset-0 z-30 m-auto flex size-fit items-center justify-center'>

                <motion.div
                    initial={ { opacity: 0, scale: 0.9 } }
                    animate={ { opacity: 1, scale: 1 } }
                    exit={ { opacity: 0, scale: 0.9 } }
                    className='glass-panel flex max-h-[80vh] w-80 flex-col gap-3 overflow-y-auto rounded-2xl p-4'>

                    <div className='flex items-center justify-between'>

                        <div className='text-medium text-txt-normal font-bold'>

                            { T('Dashboard.Logout.Title') }

                        </div>

                        <button
                            type='button'
                            onClick={ onClose }
                            className='btn-muted flex size-8 items-center justify-center rounded-lg'>

                            <IoClose size={ 20 } />

                        </button>

                    </div>

                    <div className='bg-txt-error/10 text-tiny text-txt-error flex items-start gap-2 rounded-xl px-3 py-2 text-start'>

                        <FiAlertTriangle size={ 16 } className='mt-0.5 shrink-0' />

                        <span>

                            { T('Dashboard.Logout.Message') }

                        </span>

                    </div>

                    {
                        error.length > 0 &&
                        (
                            <div className='bg-txt-error/15 text-tiny text-txt-error rounded-lg px-3 py-2 text-center'>

                                { error }

                            </div>
                        )
                    }

                    <label className='flex flex-col gap-2'>

                        <div className='text-tiny text-txt-muted'>

                            { T('Dashboard.Logout.Password') }

                        </div>

                        <div className='relative flex items-center'>

                            <HiOutlineLockClosed className='text-txt-muted absolute left-3' size={ 18 } />

                            <input
                                value={ password }
                                placeholder={ T('Dashboard.Logout.Password') }
                                type={ showPassword ? 'text' : 'password' }
                                onChange={ (event) => { setPassword(event.target.value); } }
                                // eslint-disable-next-line @typescript-eslint/strict-void-return
                                onKeyDown={ (event) => event.key === 'Enter' && void onConfirm() }
                                className='glass-input text-small h-11 w-full rounded-xl px-10' />

                            <button
                                type='button'
                                onClick={ () => { setShowPassword((value) => !value); } }
                                className='text-txt-muted absolute right-3 rounded-lg'>

                                {
                                    showPassword ? <HiEyeOff size={ 18 } /> : <HiEye size={ 18 } />
                                }

                            </button>

                        </div>

                    </label>

                    <div className='mt-1 flex gap-2'>

                        <button
                            type='button'
                            onClick={ onClose }
                            className='btn-muted text-small h-11 flex-1 rounded-xl'>

                            { T('Dashboard.Logout.Cancel') }

                        </button>

                        <button
                            type='button'
                            disabled={ isLoading }
                            onClick={ () => { void onConfirm(); } }
                            className='btn-normal text-small text-txt-error h-11 flex-1 rounded-xl disabled:cursor-not-allowed! disabled:opacity-60'>

                            {
                                isLoading ? T('Dashboard.Logout.Pending') : T('Dashboard.Logout.Confirm')
                            }

                        </button>

                    </div>

                </motion.div>

            </div>
        </>
    );
}
