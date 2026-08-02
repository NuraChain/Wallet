import type { TokenBalance } from '../../core/token';

import { useMemo, useState } from 'react';
import { isAddress, parseUnits } from 'ethers';
import { FiArrowLeft, FiCheckCircle } from 'react-icons/fi';

import WalletManager from '../../core/wallet';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Panel from '../ui/panel';
import Button from '../ui/button';
import Spinner from '../ui/spinner';
import SectionHeader from '../ui/section';

import { TextField } from '../ui/field';
import { Modal, ModalActions, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { getProvider, type Network } from '../../core/network';
import { shortAddress, trimAmount } from '../../utility/format';

type Step = 'form' | 'review' | 'pending' | 'success' | 'error';

interface Asset
{
    key: string;
    symbol: string;
    decimals: number;
    value: bigint;
    formatted: string;
    token?: { address: string; decimals: number };
}

/**
 * DashboardSend - Guided transfer flow for the native coin or a curated ERC20 token.
 *
 * The signing/broadcast step is reached only after an explicit review screen showing the recipient, amount, asset, and network. The wallet is derived from the mnemonic in-memory for the single send and never persisted.
 * @param {object} props Component props.
 * @param {string} props.mnemonic The unlocked mnemonic used to derive the signer.
 * @param {number} props.index The active account's derivation index, so the transfer is signed by the account the user is looking at.
 * @param {Network} props.network The active network.
 * @param {bigint} props.nativeValue Native balance in wei.
 * @param {string} props.nativeFormatted Native balance as a decimal string.
 * @param {TokenBalance[]} props.tokens Curated token balances.
 * @param {() => void} props.onSent Called after a successful broadcast so the parent can refresh balances.
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The send modal.
 */
export default function DashboardSend({ mnemonic, index, network, nativeValue, nativeFormatted, tokens, onSent, onClose }: { mnemonic: string; index: number; network: Network; nativeValue: bigint; nativeFormatted: string; tokens: TokenBalance[]; onSent: () => void; onClose: () => void })
{
    const assets = useMemo<Asset[]>(() => [
        { key: 'native', symbol: network.symbol, decimals: network.decimals, value: nativeValue, formatted: nativeFormatted },
        ...tokens.map((item) => ({ key: item.token.address, symbol: item.token.symbol, decimals: item.token.decimals, value: item.value, formatted: item.formatted, token: { address: item.token.address, decimals: item.token.decimals } }))
    ], [ network, nativeValue, nativeFormatted, tokens ]);

    const [ step, setStep ] = useState<Step>('form');
    const [ error, setError ] = useState('');
    const [ hash, setHash ] = useState('');
    const [ to, setTo ] = useState('');
    const [ amount, setAmount ] = useState('');

    const asset = assets[0];

    /**
     * What the confirmation screen restates before anything is signed. Three label/value rows drawn
     * the same way, so they are listed rather than written out three times.
     */
    const reviewMap =
    [
        { label: T('Dashboard.Send.Amount'), value: `${ trimAmount(amount) } ${ asset.symbol }`, mono: true },
        { label: T('Dashboard.Send.To'), value: shortAddress(to), mono: true },
        { label: T('Dashboard.Network.Title'), value: network.name, mono: false }
    ];

    const onReview = () =>
    {
        if (!isAddress(to))
        {
            setError(T('Dashboard.Send.InvalidAddress'));

            return;
        }

        try
        {
            const parsed = parseUnits(amount || '0', asset.decimals);

            if (parsed <= 0n)
            {
                setError(T('Dashboard.Send.InvalidAmount'));

                return;
            }

            if (parsed > asset.value)
            {
                setError(T('Dashboard.Send.Insufficient'));

                return;
            }
        }
        catch
        {
            setError(T('Dashboard.Send.InvalidAmount'));

            return;
        }

        setError('');
        setStep('review');
    };

    const onConfirm = async() =>
    {
        setStep('pending');

        try
        {
            const wallet = new WalletManager(mnemonic, index);
            const result = await wallet.send(getProvider(), { to, amount, token: asset.token });

            setHash(result);
            setStep('success');
            onSent();
        }
        catch
        {
            setStep('error');
        }
    };

    return (
        <Modal onClose={ onClose }>

            <ModalHeader
                title={ T('Dashboard.Send.Title') }
                titleClass='min-w-0 truncate'
                className='gap-2'
                onClose={ onClose } />

            {
                step === 'form' &&
                (
                    <div className='flex flex-col gap-3'>

                        <Alert text={ error } />

                        <div className='flex flex-col gap-1'>

                            <Text text={ T('Dashboard.Send.Recipient') } />

                            <TextField
                                value={ to }
                                dir='ltr'
                                placeholder='0x…'
                                onValue={ setTo }
                                className='font-mono' />

                        </div>

                        <div className='flex flex-col gap-1'>

                            <SectionHeader title={ T('Dashboard.Send.Amount') }>

                                <Button
                                    variant='muted'
                                    onClick={ () => { setAmount(asset.formatted); } }
                                    className='rounded-lg px-2 py-0.5 text-tiny text-txt-muted'
                                    text={ T('Dashboard.Send.Max', trimAmount(asset.formatted)) } />

                            </SectionHeader>

                            <TextField
                                value={ amount }
                                dir='ltr'
                                inputMode='decimal'
                                placeholder='0.0'
                                onValue={ setAmount }
                                className='font-mono' />

                        </div>

                        <Button
                            variant='primary'
                            size='action'
                            onClick={ onReview }
                            text={ T('Dashboard.Send.Review') } />

                    </div>
                )
            }

            {
                step === 'review' &&
                (
                    <div className='flex flex-col gap-3'>

                        <Panel className='flex flex-col gap-2 rounded-xl p-3'>

                            {
                                reviewMap.map((item) => (
                                    <div
                                        key={ item.label }
                                        className='flex items-center justify-between gap-2'>

                                        <Text text={ item.label } />

                                        { /*
                                          * `captionStrong` is the muted caption above at the same size
                                          * in the normal colour, which is the whole difference between
                                          * a label and its value here.
                                          */ }
                                        <Text
                                            variant='captionStrong'
                                            dir={ item.mono ? 'ltr' : undefined }
                                            className={ item.mono ? 'font-mono' : '' }
                                            text={ item.value } />

                                    </div>
                                ))
                            }

                        </Panel>

                        <ModalActions className='mt-0'>

                            <Button
                                variant='muted'
                                size='action'
                                onClick={ () => { setStep('form'); } }
                                leftIcon={ <FiArrowLeft size={ 16 } /> }
                                text={ T('Dashboard.Send.Back') } />

                            <Button
                                variant='primary'
                                size='action'
                                onClick={ () => { void onConfirm(); } }
                                text={ T('Dashboard.Send.Confirm') } />

                        </ModalActions>

                    </div>
                )
            }

            {
                step === 'pending' &&
                (
                    <div className='flex flex-col items-center gap-3 py-6'>

                        <Spinner size={ 32 } className='text-txt-muted' />

                        <Text variant='bodyMuted' text={ T('Dashboard.Send.Pending') } />

                    </div>
                )
            }

            {
                step === 'success' &&
                (
                    <div className='flex flex-col items-center gap-3 py-4'>

                        <FiCheckCircle size={ 40 } className='text-txt-normal' />

                        <Text variant='body' text={ T('Dashboard.Send.Success') } />

                        <div dir='ltr' className='w-full rounded-xl bg-base-3 p-2 text-center font-mono text-tiny break-all text-txt-muted select-text!'>

                            { hash }

                        </div>

                        <Button
                            variant='primary'
                            size='action'
                            fullWidth
                            onClick={ onClose }
                            text={ T('Dashboard.Send.Done') } />

                    </div>
                )
            }

            {
                step === 'error' &&
                (
                    <div className='flex flex-col items-center gap-3 py-4'>

                        <Text
                            variant='body'
                            className='text-center text-txt-error'
                            text={ T('Dashboard.Send.Error') } />

                        <Button
                            variant='muted'
                            size='action'
                            fullWidth
                            onClick={ () => { setStep('form'); } }
                            text={ T('Dashboard.Send.Back') } />

                    </div>
                )
            }

        </Modal>
    );
}
