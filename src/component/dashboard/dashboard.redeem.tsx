import { useState } from 'react';
import { CircleCheckBig, Gift, Info } from 'lucide-react';

import Text from '../../ui/text';
import Alert from '../../ui/alert';
import Button from '../../ui/button';
import IconBox from '../../ui/iconbox';
import Popover, { PopoverAnchor } from '../../ui/popover';
import { ReadonlyField, TextField } from '../../ui/field';
import { Modal, ModalHeader } from '../../ui/modal';

import { T } from '../../utility/language';
import { isRedeemCode, redeemCode, redeemShop } from '../../core/redeem';
import { Vertical } from '../../ui/stack';
import type { RedeemFailure } from '../../type/wallet';

const failureText: Record<RedeemFailure | 'failed', string> = {
    validation: 'Dashboard.Redeem.ErrorInvalid',
    'not-found': 'Dashboard.Redeem.ErrorUnknown',
    conflict: 'Dashboard.Redeem.ErrorUsed',
    'rate-limited': 'Dashboard.Redeem.ErrorBusy',
    failed: 'Dashboard.Redeem.ErrorFailed'
};

const shopHost = new URL(redeemShop).host;

export default function DashboardRedeem({ address, onBrowse, onClose }: { address: string; onBrowse: (url: string) => void; onClose: () => void }) {
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [done, setDone] = useState<{ amount: number; wallet: string; notified: boolean }>();
    const [showInfo, setShowInfo] = useState(false);
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
                setDone(result);

                return;
            }

            setError(T(failureText[result.reason]));
        } finally {
            setIsLoading(false);
        }
    };

    // Every translation names the shop's domain as written, so it is split out and made the link.
    const [infoBefore, ...infoAfter] = T('Dashboard.Redeem.Info').split(shopHost);

    return (
        <Modal scroll onClose={onClose}>
            <ModalHeader
                title={T('Dashboard.Redeem.Title')}
                truncate
                onClose={onClose}
                leading={
                    <IconBox tone='primary'>
                        <Gift size={16} />
                    </IconBox>
                }
                action={
                    <PopoverAnchor>
                        <Button
                            variant='muted'
                            size='icon'
                            onClick={() => {
                                setShowInfo((value) => !value);
                            }}
                            shrink={false}
                            icon={<Info size={18} />}
                        />

                        <Popover
                            open={showInfo}
                            anchor='corner'
                            onClose={() => {
                                setShowInfo(false);
                            }}
                            look='note'
                        >
                            {infoBefore}

                            {infoAfter.length > 0 && (
                                <>
                                    <Button
                                        variant='link'
                                        dir='ltr'
                                        onClick={() => {
                                            setShowInfo(false);

                                            onBrowse(redeemShop);
                                        }}
                                        text={shopHost}
                                    />

                                    {infoAfter.join(shopHost)}
                                </>
                            )}
                        </Popover>
                    </PopoverAnchor>
                }
            />

            {done ? (
                <Vertical align='center' gap={2} py={4}>
                    <CircleCheckBig size={36} className='text-txt-accent' />

                    <Text variant='body' align='center' text={T('Dashboard.Redeem.Success', done.amount)} />

                    <ReadonlyField label={T('Dashboard.Redeem.Address')} value={done.wallet} />

                    <Text variant='bodyMuted' align='center' text={T(done.notified ? 'Dashboard.Redeem.SuccessNote' : 'Dashboard.Redeem.SuccessSlow')} />

                    <Button variant='normal' size='action' fullWidth onClick={onClose} mt={2} text={T('Dashboard.Redeem.Close')} />
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
                        align='center'
                        mono
                        textSize='tiny'
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
                        mt={1}
                        text={isLoading ? '' : T('Dashboard.Redeem.Submit')}
                    />
                </>
            )}
        </Modal>
    );
}
