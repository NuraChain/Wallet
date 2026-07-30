import type { Network } from '../../core/network';
import type { TokenBalance } from '../../core/token';

import { useState } from 'react';
import { motion } from 'motion/react';
import { IoClose } from 'react-icons/io5';
import { FiPlus, FiTrash2 } from 'react-icons/fi';

import TokenIcon from '../token.icon';

import { T } from '../../utility/language';
import { getTokenLogo } from '../../core/price';
import { trimAmount } from '../../utility/format';

/**
 * DashboardTokens - The token list the wallet tab reads from, plus the form that fills it.
 *
 * The wallet ships with no ERC20s: every row here was added by the user pasting a contract address. The symbol, name and decimals are read off the contract itself, so the only thing to type is the address.
 *
 * Removing a token only stops tracking it — the balance stays on chain and comes back if the same contract is added again.
 * @param {object} props Component props.
 * @param {Network} props.network The active network.
 * @param {TokenBalance[]} props.tokens Tracked tokens with their balances.
 * @param {(address: string) => Promise<string>} props.onAdd Adds a contract, resolving to an error message or an empty string on success.
 * @param {(address: string) => void} props.onRemove Stops tracking one contract.
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The token manager modal.
 */
export default function DashboardTokens({ network, tokens, onAdd, onRemove, onClose }: { network: Network; tokens: TokenBalance[]; onAdd: (address: string) => Promise<string>; onRemove: (address: string) => void; onClose: () => void })
{
    const [ adding, setAdding ] = useState(false);
    const [ busy, setBusy ] = useState(false);
    const [ error, setError ] = useState('');
    const [ contract, setContract ] = useState('');

    const onSave = async() =>
    {
        const value = contract.trim();

        if (value.length === 0)
        {
            setError(T('Dashboard.Tokens.InvalidAddress'));

            return;
        }

        setBusy(true);
        setError('');

        const message = await onAdd(value);

        setBusy(false);

        if (message.length > 0)
        {
            setError(message);

            return;
        }

        setContract('');
        setAdding(false);
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
                    className='glass-panel flex max-h-[80vh] w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto rounded-2xl p-4'>

                    <div className='flex items-center justify-between'>

                        <div className='text-medium font-bold text-txt-normal'>

                            { T('Dashboard.Tokens.ManageTitle') }

                        </div>

                        <button
                            type='button'
                            onClick={ onClose }
                            className='btn-muted flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg'>

                            <IoClose size={ 20 } />

                        </button>

                    </div>

                    {
                        adding ?
                            (
                                <div className='flex flex-col gap-2'>

                                    {
                                        error.length > 0 &&
                                        (
                                            <div className='rounded-lg bg-txt-error/15 px-3 py-2 text-center text-tiny text-txt-error'>

                                                { error }

                                            </div>
                                        )
                                    }

                                    <div className='text-tiny text-txt-muted'>

                                        { T('Dashboard.Tokens.ContractHint') }

                                    </div>

                                    <input
                                        dir='ltr'
                                        value={ contract }
                                        spellCheck={ false }
                                        autoComplete='off'
                                        placeholder='0x…'
                                        onChange={ (event) => { setContract(event.target.value); } }
                                        className='glass-input h-11 w-full rounded-xl px-3 font-mono text-small' />

                                    <div className='mt-1 flex gap-2'>

                                        <button
                                            type='button'
                                            disabled={ busy }
                                            onClick={ () => { setAdding(false); setError(''); } }
                                            className='btn-muted h-11 flex-1 cursor-pointer rounded-xl text-small'>

                                            { T('Dashboard.Tokens.Back') }

                                        </button>

                                        <button
                                            type='button'
                                            disabled={ busy }
                                            onClick={ () => { void onSave(); } }
                                            className='btn-primary h-11 flex-1 cursor-pointer rounded-xl text-small'>

                                            { busy ? T('Dashboard.Tokens.Checking') : T('Dashboard.Tokens.Save') }

                                        </button>

                                    </div>

                                </div>
                            ) :
                            (
                                <>
                                    {
                                        tokens.map((item) => (
                                            <div
                                                key={ item.token.address }
                                                className='flex items-center gap-3 rounded-xl p-2'>

                                                <TokenIcon
                                                    src={ getTokenLogo(network.chainId, item.token.address) }
                                                    symbol={ item.token.symbol } />

                                                <div className='flex min-w-0 flex-1 flex-col'>

                                                    <div className='truncate text-small text-txt-normal'>

                                                        { item.token.symbol }

                                                    </div>

                                                    <div className='truncate text-tiny text-txt-muted'>

                                                        { item.token.name }

                                                    </div>

                                                </div>

                                                <div dir='ltr' className='font-mono text-tiny text-txt-normal'>

                                                    { trimAmount(item.formatted) }

                                                </div>

                                                <button
                                                    type='button'
                                                    onClick={ () => { onRemove(item.token.address); } }
                                                    aria-label={ T('Dashboard.Tokens.Remove') }
                                                    className='btn-muted flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-txt-error'>

                                                    <FiTrash2 size={ 16 } />

                                                </button>

                                            </div>
                                        ))
                                    }

                                    {
                                        tokens.length === 0 &&
                                        (
                                            <div className='py-4 text-center text-tiny text-txt-muted'>

                                                { T('Dashboard.Tokens.Empty') }

                                            </div>
                                        )
                                    }

                                    <button
                                        type='button'
                                        onClick={ () => { setAdding(true); setError(''); } }
                                        className='btn-normal mt-1 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl text-small'>

                                        <FiPlus size={ 16 } />

                                        { T('Dashboard.Tokens.Add') }

                                    </button>
                                </>
                            )
                    }

                </motion.div>

            </div>
        </>
    );
}
