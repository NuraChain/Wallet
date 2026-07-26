import type { Network } from '../core/network';
import type { TokenBalance } from '../core/token';

import { motion } from 'motion/react';
import { IoClose } from 'react-icons/io5';
import { HiOutlineEye, HiOutlineEyeSlash } from 'react-icons/hi2';

import TokenIcon from './token.icon';

import { T } from '../utility/language';
import { getTokenLogo } from '../core/price';
import { trimAmount } from '../utility/format';

/**
 * DashboardTokens - Full token list with per-token visibility.
 *
 * The wallet tab only has room for the first few holdings, so the complete list lives here: every token curated for the active network, its balance, and an eye toggle that decides whether it shows up on the wallet tab.
 *
 * Hiding is display-only — a hidden token keeps its balance and reappears the moment it is switched back on.
 * @param {object} props Component props.
 * @param {Network} props.network The active network.
 * @param {TokenBalance[]} props.tokens Every curated token with its balance.
 * @param {string[]} props.hidden Contracts currently hidden on this network.
 * @param {(address: string) => void} props.onToggle Shows or hides one contract.
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The token manager modal.
 */
export default function DashboardTokens({ network, tokens, hidden, onToggle, onClose }: { network: Network; tokens: TokenBalance[]; hidden: string[]; onToggle: (address: string) => void; onClose: () => void })
{
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

                        <div className='flex flex-col'>

                            <div className='text-medium font-bold text-txt-normal'>

                                { T('Dashboard.Tokens.Manage') }

                            </div>

                            <div className='text-tiny text-txt-muted'>

                                { network.name }

                            </div>

                        </div>

                        <button
                            type='button'
                            onClick={ onClose }
                            className='btn-muted flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg'>

                            <IoClose size={ 20 } />

                        </button>

                    </div>

                    {
                        tokens.map((item) =>
                        {
                            const isHidden = hidden.includes(item.token.address);

                            return (
                                <div
                                    key={ item.token.address }
                                    className={ `flex items-center gap-3 rounded-xl p-2 duration-300 ${ isHidden ? 'opacity-50' : '' }` }>

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
                                        onClick={ () => { onToggle(item.token.address); } }
                                        aria-label={ isHidden ? T('Dashboard.Tokens.Show') : T('Dashboard.Tokens.Hide') }
                                        className='btn-muted flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg'>

                                        {
                                            isHidden ? <HiOutlineEyeSlash size={ 16 } /> : <HiOutlineEye size={ 16 } />
                                        }

                                    </button>

                                </div>
                            );
                        })
                    }

                    {
                        tokens.length === 0 &&
                        (
                            <div className='py-4 text-center text-tiny text-txt-muted'>

                                { T('Dashboard.Tokens.Empty') }

                            </div>
                        )
                    }

                </motion.div>

            </div>
        </>
    );
}
