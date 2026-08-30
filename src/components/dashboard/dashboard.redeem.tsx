import { useState } from 'react';
import { FiCheckCircle, FiGift } from 'react-icons/fi';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Button from '../ui/button';
import IconBox from '../ui/iconbox';
import { ReadonlyField, TextField } from '../ui/field';
import { Modal, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { isRedeemCode, redeemCode } from '../../core/redeem';
import { Vertical } from '../ui/stack';

export default function DashboardRedeem({ address, onClose }: { address: string; onClose: () => void }) {
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [done, setDone] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const onSubmit = async () => {
        setError('');

        if (!isRedeemCode(code)) {
            setError(T('Dashboard.Redeem.ErrorCode'));

            return;
        }

        setIsLoading(true);

        try {
            const result = await redeemCode(address, code);

            if (result.ok) {
                setDone(result.message.length > 0 ? result.message : T('Dashboard.Redeem.Success'));

                return;
            }

            setError(result.message.length > 0 ? result.message : T('Dashboard.Redeem.ErrorFailed'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal scroll onClose={onClose}>
            <ModalHeader
                title={T('Dashboard.Redeem.Title')}
                titleClass='truncate'
                onClose={onClose}
                leading={
                    <IconBox tone='primary'>
                        <FiGift size={16} />
                    </IconBox>
                }
            />

            {done.length > 0 ? (
                <Vertical className='items-center gap-2 py-4'>
                    <FiCheckCircle size={36} className='text-txt-accent' />

                    <Text variant='body' className='text-center' text={done} />

                    <Button variant='normal' size='action' fullWidth onClick={onClose} className='mt-2' text={T('Dashboard.Redeem.Close')} />
                </Vertical>
            ) : (
                <>
                    <Alert text={error} />

                    <ReadonlyField label={T('Dashboard.Redeem.Address')} value={address} />

                    <TextField
                        label={T('Dashboard.Redeem.Code')}
                        value={code}
                        onValue={setCode}
                        onEnter={() => {
                            void onSubmit();
                        }}
                        dir={code.length > 0 ? 'ltr' : undefined}
                        autoCapitalize='none'
                        spellCheck={false}
                        placeholder={T('Dashboard.Redeem.CodeHint')}
                        className='text-center font-mono text-tiny'
                    />

                    <Button
                        dim
                        variant='primary'
                        size='action'
                        disabled={isLoading}
                        loading={isLoading}
                        onClick={() => {
                            void onSubmit();
                        }}
                        aria-label={isLoading ? T('Dashboard.Redeem.Pending') : undefined}
                        className='mt-1'
                        text={isLoading ? '' : T('Dashboard.Redeem.Submit')}
                    />
                </>
            )}
        </Modal>
    );
}
