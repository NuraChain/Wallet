import { useState } from 'react';
import { FiCheckCircle, FiGift } from 'react-icons/fi';

import Alert from '../ui/alert';
import Button from '../ui/button';
import IconBox from '../ui/iconbox';
import { TextField } from '../ui/field';
import { Modal, ModalHeader } from '../ui/modal';

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
        <Modal
            onClose={ onClose }
            panelClass='max-h-[80vh] overflow-y-auto'>

            <ModalHeader
                title={ T('Dashboard.Redeem.Title') }
                titleClass='min-w-0 truncate'
                className='gap-2'
                onClose={ onClose }
                leading={
                    (
                        <IconBox tone='primary' size='size-8'>

                            <FiGift size={ 16 } />

                        </IconBox>
                    )
                } />

            {
                done.length > 0 ?
                    (
                        <div className='flex flex-col items-center gap-2 py-4'>

                            <FiCheckCircle size={ 36 } className='text-btn-primary' />

                            <div className='text-center text-small text-txt-normal'>

                                { done }

                            </div>

                            <Button
                                variant='normal'
                                size='action'
                                fullWidth
                                onClick={ onClose }
                                className='mt-2'
                                text={ T('Dashboard.Redeem.Close') } />

                        </div>
                    ) :
                    (
                        <>
                            {
                                error.length > 0 &&
                                (
                                    <Alert
                                        text={ error } />
                                )
                            }

                            <div className='flex flex-col gap-2'>

                                <div className='text-tiny text-txt-muted'>

                                    { T('Dashboard.Redeem.Address') }

                                </div>

                                <div dir='ltr' className='glass-input flex min-h-11 items-center rounded-xl px-3 py-2 font-mono text-tiny break-all text-txt-muted'>

                                    { address }

                                </div>

                            </div>

                            <TextField
                                label={ T('Dashboard.Redeem.Code') }
                                value={ code }
                                onValue={ setCode }
                                onEnter={ () => { void onSubmit(); } }
                                dir={ code.length > 0 ? 'ltr' : undefined }
                                autoCapitalize='none'
                                spellCheck={ false }
                                placeholder={ T('Dashboard.Redeem.CodeHint') }
                                className='text-center font-mono text-tiny' />

                            <Button
                                variant='primary'
                                size='action'
                                disabled={ isLoading }
                                loading={ isLoading }
                                onClick={ () => { void onSubmit(); } }
                                className='mt-1 disabled:cursor-not-allowed! disabled:opacity-60'
                                text={ isLoading ? T('Dashboard.Redeem.Pending') : T('Dashboard.Redeem.Submit') } />
                        </>
                    )
            }

        </Modal>
    );
}
