import type { Network } from '../core/network';
import type { TokenBalance } from '../core/token';

import { useEffect, useState } from 'react';
import { IoChevronDown } from 'react-icons/io5';
import { FiArrowDownLeft, FiArrowUpRight } from 'react-icons/fi';
import { HiOutlineCog6Tooth, HiOutlineSquare2Stack, HiOutlineSquares2X2, HiOutlineUser } from 'react-icons/hi2';

import TokenIcon from './token.icon';
import DashboardActivity from './dashboard.activity';

import { T } from '../utility/language';
import { getNativeLogo, getTokenLogo } from '../core/price';
import { formatUsd, shortAddress, trimAmount } from '../utility/format';

/**
 * How many token rows the wallet tab shows before sending the user to the token manager.
 */
const tokenPreview = 4;

/**
 * DashboardWallet - Primary account view: portfolio value, address, transfer actions, holdings, and history.
 *
 * Balances are fetched by the parent and passed in, so this tab and the send flow always read the same numbers. The headline figure is the whole portfolio in USD rather than the native coin alone, since the native balance is already the first row of the token list right below it.
 *
 * Transaction history is mounted here, under the token list, so the account's holdings and its movements live on one screen.
 * @param {object} props Component props.
 * @param {string} props.address The account address.
 * @param {string} props.name The account label.
 * @param {Network} props.network The active network.
 * @param {string} props.nativeFormatted Native balance as a decimal string.
 * @param {boolean} props.nativeLoading Whether the native balance is still loading.
 * @param {TokenBalance[]} props.tokens Token balances the user has not hidden.
 * @param {boolean} props.tokensLoading Whether token balances are still loading.
 * @param {number} props.total Portfolio value in USD.
 * @param {boolean} props.totalLoading Whether prices are still loading.
 * @param {() => void} props.onSend Opens the send modal.
 * @param {() => void} props.onReceive Opens the receive modal.
 * @param {() => void} props.onNetwork Opens the network modal.
 * @param {() => void} props.onAccounts Opens the account switcher.
 * @param {() => void} props.onTokens Opens the token manager.
 * @param {() => void} props.onSettings Opens the settings modal.
 * @returns {JSX.Element} The wallet tab.
 */
export default function DashboardWallet({ address, name, network, nativeFormatted, nativeLoading, tokens, tokensLoading, total, totalLoading, onSend, onReceive, onNetwork, onAccounts, onTokens, onSettings }: { address: string; name: string; network: Network; nativeFormatted: string; nativeLoading: boolean; tokens: TokenBalance[]; tokensLoading: boolean; total: number; totalLoading: boolean; onSend: () => void; onReceive: () => void; onNetwork: () => void; onAccounts: () => void; onTokens: () => void; onSettings: () => void })
{
    const [ notice, setNotice ] = useState('');

    useEffect(() =>
    {
        const timer = notice.length === 0 ? undefined : setTimeout(() => { setNotice(''); }, 5000);

        return () => { clearTimeout(timer); };
    }, [ notice ]);

    const onCopy = async() =>
    {
        try
        {
            await navigator.clipboard.writeText(address);

            setNotice(T('Dashboard.Copied'));
        }
        catch
        {
            setNotice(T('Dashboard.CopyFailed'));
        }
    };

    return (
        <div className='flex flex-col gap-4'>

            <div className='flex items-center justify-between gap-2'>

                <button
                    type='button'
                    onClick={ onAccounts }
                    className='btn-muted flex h-9 min-w-0 cursor-pointer items-center gap-2 rounded-full px-3 text-tiny'>

                    <div className='flex size-5 shrink-0 items-center justify-center rounded-full bg-btn-primary text-txt-reverse'>

                        <HiOutlineUser size={ 12 } />

                    </div>

                    <span className='truncate'>

                        { name }

                    </span>

                    <IoChevronDown size={ 14 } className='shrink-0' />

                </button>

                <div className='flex shrink-0 items-center gap-2'>

                    <button
                        type='button'
                        onClick={ onNetwork }
                        className='btn-muted flex h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-tiny'>

                        <TokenIcon
                            primary
                            src={ getNativeLogo(network.chainId) }
                            symbol={ network.symbol }
                            className='size-5 text-tiny' />

                        { network.name }

                        <IoChevronDown size={ 14 } />

                    </button>

                    <button
                        type='button'
                        onClick={ onSettings }
                        aria-label={ T('Dashboard.Settings.Title') }
                        className='btn-muted flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-txt-normal'>

                        <HiOutlineCog6Tooth size={ 18 } />

                    </button>

                </div>

            </div>

            <div className='flex flex-col items-center gap-2 py-2'>

                <div dir='ltr' className='text-3xl font-bold text-txt-normal'>

                    { totalLoading || nativeLoading ? '…' : formatUsd(total) }

                </div>

                <div className='relative flex flex-col items-center'>

                    <button
                        type='button'
                        onClick={ () => { void onCopy(); } }
                        className='flex cursor-pointer items-center gap-1 text-tiny text-txt-muted hover:text-txt-normal'>

                        <span dir='ltr' className='font-mono'>

                            { shortAddress(address) }

                        </span>

                        <HiOutlineSquare2Stack size={ 14 } />

                    </button>

                    {
                        notice.length > 0 &&
                        (
                            <div className='pointer-events-none absolute inset-x-0 top-full z-10 mt-1 text-center text-tiny whitespace-nowrap text-txt-muted'>

                                { notice }

                            </div>
                        )
                    }

                </div>

            </div>

            <div className='flex justify-center gap-3'>

                <button
                    type='button'
                    onClick={ onSend }
                    className='flex cursor-pointer flex-col items-center gap-1'>

                    <div className='btn-primary flex size-14 items-center justify-center rounded-2xl'>

                        <FiArrowUpRight size={ 22 } />

                    </div>

                    <span className='text-tiny text-txt-muted'>

                        { T('Dashboard.Send.Title') }

                    </span>

                </button>

                <button
                    type='button'
                    onClick={ onReceive }
                    className='flex cursor-pointer flex-col items-center gap-1'>

                    <div className='btn-normal flex size-14 items-center justify-center rounded-2xl'>

                        <FiArrowDownLeft size={ 22 } />

                    </div>

                    <span className='text-tiny text-txt-muted'>

                        { T('Dashboard.Receive.Title') }

                    </span>

                </button>

            </div>

            <div className='flex flex-col gap-2'>

                <div className='flex items-center justify-between gap-2'>

                    <div className='text-tiny text-txt-muted'>

                        { T('Dashboard.Tokens.Title') }

                    </div>

                    <button
                        type='button'
                        onClick={ onTokens }
                        className='btn-muted flex h-8 cursor-pointer items-center gap-1 rounded-full px-3 text-tiny'>

                        <HiOutlineSquares2X2 size={ 14 } />

                        { T('Dashboard.Tokens.Manage') }

                    </button>

                </div>

                <div className='glass-panel flex items-center gap-3 rounded-xl p-3'>

                    <TokenIcon
                        primary
                        src={ getNativeLogo(network.chainId) }
                        symbol={ network.symbol } />

                    <div className='flex min-w-0 flex-1 flex-col'>

                        <div className='truncate text-small text-txt-normal'>

                            { network.symbol }

                        </div>

                        <div className='truncate text-tiny text-txt-muted'>

                            { network.name }

                        </div>

                    </div>

                    <div dir='ltr' className='font-mono text-small text-txt-normal'>

                        { nativeLoading ? '…' : trimAmount(nativeFormatted) }

                    </div>

                </div>

                {
                    tokens.slice(0, tokenPreview).map((item) => (
                        <div
                            key={ item.token.address }
                            className='glass-panel flex items-center gap-3 rounded-xl p-3'>

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

                            <div dir='ltr' className='font-mono text-small text-txt-normal'>

                                { trimAmount(item.formatted) }

                            </div>

                        </div>
                    ))
                }

                {
                    !tokensLoading && tokens.length === 0 &&
                    (
                        <div className='py-2 text-center text-tiny text-txt-muted'>

                            { T('Dashboard.Tokens.Empty') }

                        </div>
                    )
                }

            </div>

            <DashboardActivity
                address={ address }
                network={ network } />

        </div>
    );
}
