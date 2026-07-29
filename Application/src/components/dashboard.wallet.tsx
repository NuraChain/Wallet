import type { Network } from '../core/network';
import type { TokenBalance } from '../core/token';
import type { Transaction } from '../hook/history';

import { useEffect, useState } from 'react';
import { IoChevronDown } from 'react-icons/io5';
import { FiArrowDownLeft, FiArrowUpRight } from 'react-icons/fi';
import { HiOutlineCog6Tooth, HiOutlineSquare2Stack, HiOutlineSquares2X2, HiOutlineUser } from 'react-icons/hi2';

import TokenIcon from './token.icon';
import DashboardActivity from './dashboard.activity';

import { T } from '../utility/language';
import { getNativeCoinId, getNativeLogo, getTokenLogo, type PriceMap } from '../core/price';
import { formatUsd, shortAddress, trimAmount } from '../utility/format';

/**
 * DashboardWallet - Primary account view: portfolio value, address, transfer actions, holdings, and history.
 *
 * Balances are fetched by the parent and passed in, so this tab and the send flow always read the same numbers. The headline figure is the whole portfolio in USD rather than the native coin alone, since the native balance is already the first row of the token list right below it.
 *
 * The native coin is the only asset shown out of the box. ERC20 rows appear once the user adds their contracts in the token manager, so the list stays exactly as long as the user made it.
 *
 * Transaction history is mounted here, under the token list, so the account's holdings and its movements live on one screen.
 * @param {object} props Component props.
 * @param {string} props.address The account address.
 * @param {string} props.name The account label.
 * @param {Network} props.network The active network.
 * @param {string} props.nativeFormatted Native balance as a decimal string.
 * @param {boolean} props.nativeLoading Whether the native balance is still loading.
 * @param {TokenBalance[]} props.tokens Balances of the tokens the user added.
 * @param {number} props.total Portfolio value in USD.
 * @param {boolean} props.totalLoading Whether prices are still loading.
 * @param {PriceMap} props.prices USD price per CoinGecko coin id, used for the per-row value.
 * @param {() => void} props.onSend Opens the send modal.
 * @param {() => void} props.onReceive Opens the receive modal.
 * @param {() => void} props.onNetwork Opens the network modal.
 * @param {() => void} props.onAccounts Opens the account switcher.
 * @param {() => void} props.onTokens Opens the token manager.
 * @param {() => void} props.onSettings Opens the settings modal.
 * @param {{ items: Transaction[]; loading: boolean }} props.history The account's transaction history.
 * @param {(hash: string) => void} props.onTransaction Opens one transaction on the explorer.
 * @param {() => void} props.onOverview Opens the full history page.
 * @returns {JSX.Element} The wallet tab.
 */
export default function DashboardWallet({ address, name, network, nativeFormatted, nativeLoading, tokens, total, totalLoading, prices, history, onSend, onReceive, onNetwork, onAccounts, onTokens, onSettings, onTransaction, onOverview }: { address: string; name: string; network: Network; nativeFormatted: string; nativeLoading: boolean; tokens: TokenBalance[]; total: number; totalLoading: boolean; prices: PriceMap; history: { items: Transaction[]; loading: boolean }; onSend: () => void; onReceive: () => void; onNetwork: () => void; onAccounts: () => void; onTokens: () => void; onSettings: () => void; onTransaction: (hash: string) => void; onOverview: () => void })
{
    const [ notice, setNotice ] = useState('');

    /**
     * RowValue - USD worth of one holding.
     *
     * A coin with no CoinGecko id, or one whose price has not landed yet, resolves to `undefined` so
     * the caller can leave the line out entirely rather than print a misleading `$0.00`.
     * @param {string} coinId The CoinGecko coin id.
     * @param {string} formatted The balance as a decimal string.
     * @returns {string | undefined} The formatted USD value, or `undefined` when it cannot be priced.
     */
    const RowValue = (coinId: string, formatted: string) =>
    {
        const price = prices[coinId];

        if (price === undefined)
        {
            return undefined;
        }

        return formatUsd(Number(formatted) * price);
    };

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
        <div className='flex flex-col gap-4 mt-2'>

            <div className='flex items-center gap-2'>

                <button
                    type='button'
                    onClick={ onAccounts }
                    className='chip-control flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-xl ps-1 pe-2.5 text-tiny'>

                    <div className='flex size-7 shrink-0 items-center justify-center rounded-lg bg-btn-primary text-txt-reverse'>

                        <HiOutlineUser size={ 14 } />

                    </div>

                    <span className='min-w-0 flex-1 truncate text-start font-medium'>

                        { name }

                    </span>

                    <IoChevronDown size={ 12 } className='shrink-0 opacity-40' />

                </button>

                <button
                    type='button'
                    onClick={ onNetwork }
                    className='chip-control flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-xl ps-1 pe-2.5 text-tiny'>

                    <TokenIcon
                        primary
                        src={ getNativeLogo(network.chainId) }
                        symbol={ network.symbol }
                        className='size-7 shrink-0 text-tiny' />

                    <span className='min-w-0 flex-1 truncate text-start font-medium'>

                        { network.name }

                    </span>

                    <IoChevronDown size={ 12 } className='shrink-0 opacity-40' />

                </button>

                <button
                    type='button'
                    onClick={ onSettings }
                    aria-label={ T('Dashboard.Settings.Title') }
                    className='chip-control flex size-9 shrink-0 items-center justify-center rounded-xl'>

                    <HiOutlineCog6Tooth size={ 17 } />

                </button>

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
                            <div className='pointer-events-none absolute top-full left-1/2 z-10 mt-1 w-max -translate-x-1/2 text-center text-tiny whitespace-nowrap text-txt-muted'>

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
                        className='btn-muted flex h-8 cursor-pointer items-center gap-1 rounded-lg px-3 text-tiny'>

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

                    <div dir='ltr' className='flex shrink-0 flex-col items-center'>

                        <div className='font-mono text-small text-txt-normal'>

                            { nativeLoading ? '…' : trimAmount(nativeFormatted) }

                        </div>

                        {
                            !nativeLoading && RowValue(getNativeCoinId(network.chainId), nativeFormatted) !== undefined && (
                                <div className='font-mono text-tiny text-txt-muted'>

                                    { RowValue(getNativeCoinId(network.chainId), nativeFormatted) }

                                </div>
                            )
                        }

                    </div>

                </div>

                {
                    tokens.map((item) => (
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

                            <div dir='ltr' className='flex shrink-0 flex-col items-center'>

                                <div className='font-mono text-small text-txt-normal'>

                                    { trimAmount(item.formatted) }

                                </div>

                                {
                                    RowValue(item.token.coinId, item.formatted) !== undefined && (
                                        <div className='font-mono text-tiny text-txt-muted'>

                                            { RowValue(item.token.coinId, item.formatted) }

                                        </div>
                                    )
                                }

                            </div>

                        </div>
                    ))
                }

            </div>

            <DashboardActivity
                items={ history.items }
                loading={ history.loading }
                canOpen={ network.explorerUrl.length > 0 }
                onOpen={ onTransaction }
                onOverview={ onOverview } />

        </div>
    );
}
