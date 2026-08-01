import type { TokenBalance } from '../../core/token';

import { useMemo, useState } from 'react';
import { isAddress, parseUnits } from 'ethers';
import { FiArrowLeft, FiCheckCircle } from 'react-icons/fi';

import WalletManager from '../../core/wallet';

import Alert from '../ui/alert';
import Button from '../ui/button';
import Spinner from '../ui/spinner';
import SectionHeader from '../ui/section';
import { TextField } from '../ui/field';
import { Modal, ModalHeader } from '../ui/modal';

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
    const [ selected, setSelected ] = useState('native');

    const asset = assets.find((item) => item.key === selected) ?? assets[0];

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

                        {
                            error.length > 0 &&
                            (
                                <Alert>

                                    { error }

                                </Alert>
                            )
                        }

                        <div className='flex flex-wrap gap-1'>

                            {
                                assets.map((item) => (
                                    <Button
                                        key={ item.key }
                                        onClick={ () => { setSelected(item.key); } }
                                        className={ `flex h-9 items-center rounded-xl px-3 text-tiny duration-300 ${ item.key === selected ? 'bg-btn-primary text-txt-reverse' : 'btn-muted' }` }
                                        text={ item.symbol } />
                                ))
                            }

                        </div>

                        <div className='flex flex-col gap-1'>

                            <div className='text-tiny text-txt-muted'>

                                { T('Dashboard.Send.Recipient') }

                            </div>

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

                        <div className='glass-panel flex flex-col gap-2 rounded-xl p-3'>

                            <div className='flex items-center justify-between gap-2 text-tiny'>

                                <span className='text-txt-muted'>

                                    { T('Dashboard.Send.Amount') }

                                </span>

                                <span dir='ltr' className='font-mono text-txt-normal'>

                                    { `${ trimAmount(amount) } ${ asset.symbol }` }

                                </span>

                            </div>

                            <div className='flex items-center justify-between gap-2 text-tiny'>

                                <span className='text-txt-muted'>

                                    { T('Dashboard.Send.To') }

                                </span>

                                <span dir='ltr' className='font-mono text-txt-normal'>

                                    { shortAddress(to) }

                                </span>

                            </div>

                            <div className='flex items-center justify-between gap-2 text-tiny'>

                                <span className='text-txt-muted'>

                                    { T('Dashboard.Network.Title') }

                                </span>

                                <span className='text-txt-normal'>

                                    { network.name }

                                </span>

                            </div>

                        </div>

                        <div className='flex gap-2'>

                            <Button
                                variant='muted'
                                size='action'
                                onClick={ () => { setStep('form'); } }
                                className='flex-1'>

                                <FiArrowLeft size={ 16 } />

                                { T('Dashboard.Send.Back') }

                            </Button>

                            <Button
                                variant='primary'
                                size='action'
                                onClick={ () => { void onConfirm(); } }
                                className='flex-1'
                                text={ T('Dashboard.Send.Confirm') } />

                        </div>

                    </div>
                )
            }

            {
                step === 'pending' &&
                (
                    <div className='flex flex-col items-center gap-3 py-6'>

                        <Spinner size={ 32 } className='text-txt-muted' />

                        <div className='text-small text-txt-muted'>

                            { T('Dashboard.Send.Pending') }

                        </div>

                    </div>
                )
            }

            {
                step === 'success' &&
                (
                    <div className='flex flex-col items-center gap-3 py-4'>

                        <FiCheckCircle size={ 40 } className='text-txt-normal' />

                        <div className='text-small text-txt-normal'>

                            { T('Dashboard.Send.Success') }

                        </div>

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

                        <div className='text-center text-small text-txt-error'>

                            { T('Dashboard.Send.Error') }

                        </div>

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
