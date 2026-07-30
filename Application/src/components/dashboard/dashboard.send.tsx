import type { TokenBalance } from '../../core/token';

import { motion } from 'motion/react';
import { IoClose } from 'react-icons/io5';
import { useMemo, useState } from 'react';
import { isAddress, parseUnits } from 'ethers';
import { FiArrowLeft, FiCheckCircle } from 'react-icons/fi';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';

import WalletManager from '../../core/wallet';

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
                    className='glass-panel flex w-80 flex-col gap-3 rounded-2xl p-4'>

                    <div className='flex items-center justify-between gap-2'>

                        <div className='text-medium text-txt-normal min-w-0 truncate font-bold'>

                            { T('Dashboard.Send.Title') }

                        </div>

                        <button
                            type='button'
                            onClick={ onClose }
                            className='btn-muted flex size-8 items-center justify-center rounded-lg'>

                            <IoClose size={ 20 } />

                        </button>

                    </div>

                    {
                        step === 'form' &&
                        (
                            <div className='flex flex-col gap-3'>

                                {
                                    error.length > 0 &&
                                    (
                                        <div className='bg-txt-error/15 text-tiny text-txt-error rounded-lg px-3 py-2 text-center'>

                                            { error }

                                        </div>
                                    )
                                }

                                <div className='flex flex-wrap gap-1'>

                                    {
                                        assets.map((item) => (
                                            <button
                                                key={ item.key }
                                                type='button'
                                                onClick={ () => { setSelected(item.key); } }
                                                className={ `text-tiny flex h-9 items-center rounded-xl px-3 duration-300 ${ item.key === selected ? 'bg-btn-primary text-txt-reverse' : 'btn-muted' }` }>

                                                { item.symbol }

                                            </button>
                                        ))
                                    }

                                </div>

                                <div className='flex flex-col gap-1'>

                                    <div className='text-tiny text-txt-muted'>

                                        { T('Dashboard.Send.Recipient') }

                                    </div>

                                    <input
                                        value={ to }
                                        dir='ltr'
                                        placeholder='0x…'
                                        onChange={ (event) => { setTo(event.target.value); } }
                                        className='glass-input text-small h-11 w-full rounded-xl px-3 font-mono' />

                                </div>

                                <div className='flex flex-col gap-1'>

                                    <div className='flex items-center justify-between'>

                                        <div className='text-tiny text-txt-muted'>

                                            { T('Dashboard.Send.Amount') }

                                        </div>

                                        <button
                                            type='button'
                                            onClick={ () => { setAmount(asset.formatted); } }
                                            className='btn-muted text-tiny text-txt-muted rounded-lg px-2 py-0.5'>

                                            { T('Dashboard.Send.Max', trimAmount(asset.formatted)) }

                                        </button>

                                    </div>

                                    <input
                                        value={ amount }
                                        dir='ltr'
                                        inputMode='decimal'
                                        placeholder='0.0'
                                        onChange={ (event) => { setAmount(event.target.value); } }
                                        className='glass-input text-small h-11 w-full rounded-xl px-3 font-mono' />

                                </div>

                                <button
                                    type='button'
                                    onClick={ onReview }
                                    className='btn-primary text-small h-11 rounded-xl'>

                                    { T('Dashboard.Send.Review') }

                                </button>

                            </div>
                        )
                    }

                    {
                        step === 'review' &&
                        (
                            <div className='flex flex-col gap-3'>

                                <div className='glass-panel flex flex-col gap-2 rounded-xl p-3'>

                                    <div className='text-tiny flex items-center justify-between gap-2'>

                                        <span className='text-txt-muted'>

                                            { T('Dashboard.Send.Amount') }

                                        </span>

                                        <span dir='ltr' className='text-txt-normal font-mono'>

                                            { `${ trimAmount(amount) } ${ asset.symbol }` }

                                        </span>

                                    </div>

                                    <div className='text-tiny flex items-center justify-between gap-2'>

                                        <span className='text-txt-muted'>

                                            { T('Dashboard.Send.To') }

                                        </span>

                                        <span dir='ltr' className='text-txt-normal font-mono'>

                                            { shortAddress(to) }

                                        </span>

                                    </div>

                                    <div className='text-tiny flex items-center justify-between gap-2'>

                                        <span className='text-txt-muted'>

                                            { T('Dashboard.Network.Title') }

                                        </span>

                                        <span className='text-txt-normal'>

                                            { network.name }

                                        </span>

                                    </div>

                                </div>

                                <div className='flex gap-2'>

                                    <button
                                        type='button'
                                        onClick={ () => { setStep('form'); } }
                                        className='btn-muted text-small flex h-11 flex-1 items-center justify-center gap-2 rounded-xl'>

                                        <FiArrowLeft size={ 16 } />

                                        { T('Dashboard.Send.Back') }

                                    </button>

                                    <button
                                        type='button'
                                        onClick={ () => { void onConfirm(); } }
                                        className='btn-primary text-small h-11 flex-1 rounded-xl'>

                                        { T('Dashboard.Send.Confirm') }

                                    </button>

                                </div>

                            </div>
                        )
                    }

                    {
                        step === 'pending' &&
                        (
                            <div className='flex flex-col items-center gap-3 py-6'>

                                <AiOutlineLoading3Quarters size={ 32 } className='text-txt-muted animate-spin' />

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

                                <div dir='ltr' className='bg-base-3 text-tiny text-txt-muted w-full rounded-xl p-2 text-center font-mono break-all select-text!'>

                                    { hash }

                                </div>

                                <button
                                    type='button'
                                    onClick={ onClose }
                                    className='btn-primary text-small h-11 w-full rounded-xl'>

                                    { T('Dashboard.Send.Done') }

                                </button>

                            </div>
                        )
                    }

                    {
                        step === 'error' &&
                        (
                            <div className='flex flex-col items-center gap-3 py-4'>

                                <div className='text-small text-txt-error text-center'>

                                    { T('Dashboard.Send.Error') }

                                </div>

                                <button
                                    type='button'
                                    onClick={ () => { setStep('form'); } }
                                    className='btn-muted text-small h-11 w-full rounded-xl'>

                                    { T('Dashboard.Send.Back') }

                                </button>

                            </div>
                        )
                    }

                </motion.div>

            </div>
        </>
    );
}
