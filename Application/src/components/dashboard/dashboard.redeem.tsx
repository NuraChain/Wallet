import { useState } from 'react';
import { motion } from 'motion/react';
import { IoClose } from 'react-icons/io5';
import { FiCheckCircle, FiGift } from 'react-icons/fi';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';

import { T } from '../../utility/language';
import { isRedeemCode, redeemCode } from '../../core/redeem';

/**
 * DashboardRedeem - Redeems a code against the active account.
 *
 * The address is shown but not editable: the reward goes to whichever account is selected, and letting
 * it be typed would only invite sending someone else's reward to the wrong place. The code shape is
 * checked here to catch typos before a round trip, but the server decides whether a code is real.
 * @param {object} props Component props.
 * @param {string} props.address The account the reward is credited to.
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The redeem modal.
 */
export default function DashboardRedeem({ address, onClose }: { address: string; onClose: () => void })
{
    const [ code, setCode ] = useState('');
    const [ error, setError ] = useState('');
    const [ done, setDone ] = useState('');
    const [ isLoading, setIsLoading ] = useState(false);

    const onSubmit = async() =>
    {
        setError('');

        if (!isRedeemCode(code))
        {
            setError(T('Dashboard.Redeem.ErrorCode'));

            return;
        }

        setIsLoading(true);

        try
        {
            const result = await redeemCode(address, code);

            if (result.ok)
            {
                setDone(result.message.length > 0 ? result.message : T('Dashboard.Redeem.Success'));

                return;
            }

            setError(result.message.length > 0 ? result.message : T('Dashboard.Redeem.ErrorFailed'));
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

                    <div className='flex items-center justify-between gap-2'>

                        <div className='flex min-w-0 items-center gap-2'>

                            <div className='bg-btn-primary text-txt-reverse flex size-8 shrink-0 items-center justify-center rounded-lg'>

                                <FiGift size={ 16 } />

                            </div>

                            <div className='text-medium text-txt-normal min-w-0 truncate font-bold'>

                                { T('Dashboard.Redeem.Title') }

                            </div>

                        </div>

                        <button
                            type='button'
                            onClick={ onClose }
                            className='btn-muted flex size-8 shrink-0 items-center justify-center rounded-lg'>

                            <IoClose size={ 20 } />

                        </button>

                    </div>

                    {
                        done.length > 0 ?
                            (
                                <div className='flex flex-col items-center gap-2 py-4'>

                                    <FiCheckCircle size={ 36 } className='text-btn-primary' />

                                    <div className='text-small text-txt-normal text-center'>

                                        { done }

                                    </div>

                                    <button
                                        type='button'
                                        onClick={ onClose }
                                        className='btn-normal text-small mt-2 h-11 w-full rounded-xl'>

                                        { T('Dashboard.Redeem.Close') }

                                    </button>

                                </div>
                            ) :
                            (
                                <>
                                    {
                                        error.length > 0 &&
                                        (
                                            <div className='bg-txt-error/15 text-tiny text-txt-error rounded-lg px-3 py-2 text-center'>

                                                { error }

                                            </div>
                                        )
                                    }

                                    <div className='flex flex-col gap-2'>

                                        <div className='text-tiny text-txt-muted'>

                                            { T('Dashboard.Redeem.Address') }

                                        </div>

                                        <div dir='ltr' className='glass-input text-tiny text-txt-muted flex min-h-11 items-center rounded-xl px-3 py-2 font-mono break-all'>

                                            { address }

                                        </div>

                                    </div>

                                    <label className='flex flex-col gap-2'>

                                        <div className='text-tiny text-txt-muted'>

                                            { T('Dashboard.Redeem.Code') }

                                        </div>

                                        <input
                                            value={ code }
                                            dir={ code.length > 0 ? 'ltr' : undefined }
                                            autoCapitalize='none'
                                            spellCheck={ false }
                                            placeholder={ T('Dashboard.Redeem.CodeHint') }
                                            onChange={ (event) => { setCode(event.target.value); } }
                                            // eslint-disable-next-line @typescript-eslint/strict-void-return
                                            onKeyDown={ (event) => event.key === 'Enter' && void onSubmit() }
                                            className='glass-input text-tiny h-11 w-full rounded-xl px-3 font-mono' />

                                    </label>

                                    <button
                                        type='button'
                                        disabled={ isLoading }
                                        onClick={ () => { void onSubmit(); } }
                                        className='btn-primary text-small mt-1 flex h-11 items-center justify-center gap-2 rounded-xl disabled:cursor-not-allowed! disabled:opacity-60'>

                                        {
                                            isLoading && <AiOutlineLoading3Quarters size={ 16 } className='shrink-0 animate-spin' />
                                        }

                                        {
                                            isLoading ? T('Dashboard.Redeem.Pending') : T('Dashboard.Redeem.Submit')
                                        }

                                    </button>
                                </>
                            )
                    }

                </motion.div>

            </div>
        </>
    );
}
