import type { Network } from '../../core/network';
import type { TokenBalance } from '../../core/token';
import type { Transaction } from '../../hook/history';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { IoChevronDown } from 'react-icons/io5';
import { FiArrowDownLeft, FiArrowUpRight, FiGift } from 'react-icons/fi';
import { HiOutlineCheck, HiOutlineCog6Tooth, HiOutlineSquare2Stack, HiOutlineSquares2X2, HiOutlineUser } from 'react-icons/hi2';

import TokenIcon from '../token.icon';
import TokenRow from '../token.row';
import DashboardActivity from './dashboard.activity';

import Button from '../ui/button';
import IconBox from '../ui/iconbox';
import SectionHeader from '../ui/section';

import { T } from '../../utility/language';
import { getNativeCoinId, getNativeLogo, getTokenLogo, type PriceMap } from '../../core/price';
import { formatUsd, shortAddress, trimAmount } from '../../utility/format';

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
 * @param {() => void} props.onRedeem Opens the redeem modal.
 * @param {() => void} props.onNetwork Opens the network modal.
 * @param {() => void} props.onAccounts Opens the account switcher.
 * @param {() => void} props.onTokens Opens the token manager.
 * @param {() => void} props.onSettings Opens the settings modal.
 * @param {{ items: Transaction[]; loading: boolean }} props.history The account's transaction history.
 * @param {(hash: string) => void} props.onTransaction Opens one transaction on the explorer.
 * @param {() => void} props.onOverview Opens the full history page.
 * @returns {JSX.Element} The wallet tab.
 */
export default function DashboardWallet({ address, name, network, nativeFormatted, nativeLoading, tokens, total, totalLoading, prices, history, onSend, onReceive, onRedeem, onNetwork, onAccounts, onTokens, onSettings, onTransaction, onOverview }: { address: string; name: string; network: Network; nativeFormatted: string; nativeLoading: boolean; tokens: TokenBalance[]; total: number; totalLoading: boolean; prices: PriceMap; history: { items: Transaction[]; loading: boolean }; onSend: () => void; onReceive: () => void; onRedeem: () => void; onNetwork: () => void; onAccounts: () => void; onTokens: () => void; onSettings: () => void; onTransaction: (hash: string) => void; onOverview: () => void })
{
    const [ copied, setCopied ] = useState(false);

    /**
     * RowValue - USD worth of one holding.
     *
     * A coin with no CoinGecko id, or one whose price has not landed yet, resolves to `undefined` so
     * the caller can leave the line out entirely rather than print a misleading `$0.00`.
     * @param {string} coinId The CoinGecko coin id.
     * @param {string} formatted The balance as a decimal string.
     * @returns {string | undefined} The formatted USD value, or `undefined` when it cannot be priced.
     */
    const rowValue = (coinId: string, formatted: string) =>
    {
        const price = prices[coinId];

        if (price === undefined)
        {
            return undefined;
        }

        return formatUsd(Number(formatted) * price);
    };

    // The icon carries the feedback, so it only has to stay swapped long enough to register.
    useEffect(() =>
    {
        const timer = copied ? setTimeout(() => { setCopied(false); }, 1400) : undefined;

        return () => { clearTimeout(timer); };
    }, [ copied ]);

    const onCopy = async() =>
    {
        try
        {
            await navigator.clipboard.writeText(address);

            setCopied(true);
        }
        catch
        {
            setCopied(false);
        }
    };

    return (
        <div className='mt-2 flex flex-col gap-4'>

            <div className='flex items-center gap-2'>

                <Button
                    variant='chip'
                    onClick={ onAccounts }
                    className='h-9 min-w-0 flex-1 gap-1.5 rounded-xl ps-1 pe-2.5 text-tiny'>

                    <IconBox tone='primary' size='size-7'>

                        <HiOutlineUser size={ 14 } />

                    </IconBox>

                    <span className='min-w-0 flex-1 truncate text-start font-medium'>

                        { name }

                    </span>

                    <IoChevronDown size={ 12 } className='shrink-0 opacity-40' />

                </Button>

                <Button
                    variant='chip'
                    onClick={ onNetwork }
                    className='h-9 min-w-0 flex-1 gap-1.5 rounded-xl ps-1 pe-2.5 text-tiny'>

                    <TokenIcon
                        primary
                        src={ getNativeLogo(network.chainId) }
                        symbol={ network.symbol }
                        className='size-7 shrink-0 text-tiny' />

                    <span className='min-w-0 flex-1 truncate text-start font-medium'>

                        { network.name }

                    </span>

                    <IoChevronDown size={ 12 } className='shrink-0 opacity-40' />

                </Button>

                <Button
                    variant='chip'
                    size='iconChip'
                    onClick={ onSettings }
                    aria-label={ T('Dashboard.Settings.Title') }
                    className='shrink-0'>

                    <HiOutlineCog6Tooth size={ 17 } />

                </Button>

            </div>

            <div className='flex flex-col items-center gap-2 py-2'>

                <div dir='ltr' className='text-3xl font-bold text-txt-normal'>

                    { totalLoading || nativeLoading ? '…' : formatUsd(total) }

                </div>

                <div className='flex flex-col items-center'>

                    <Button
                        onClick={ () => { void onCopy(); } }
                        aria-label={ T('Dashboard.Copy') }
                        className='flex cursor-pointer items-center gap-1 text-tiny text-txt-muted hover:text-txt-normal'>

                        <span dir='ltr' className='font-mono'>

                            { shortAddress(address) }

                        </span>

                        { /*
                          * The confirmation is the glyph itself: it turns into a tick, scales up and
                          * settles back. A caption under the address shifted the layout and had to be
                          * read; this is understood at a glance and takes no space.
                          */ }
                        <span className='relative flex size-5 shrink-0 items-center justify-center'>

                            <AnimatePresence initial={ false } mode='wait'>

                                {
                                    copied ?
                                        (
                                            <motion.span
                                                key='done'
                                                initial={ { scale: 0.4, opacity: 0 } }
                                                animate={ { scale: [ 0.4, 1.35, 1 ], opacity: 1 } }
                                                exit={ { scale: 0.4, opacity: 0 } }
                                                transition={ { duration: 0.35 } }
                                                className='absolute text-txt-normal'>

                                                <HiOutlineCheck size={ 18 } />

                                            </motion.span>
                                        ) :
                                        (
                                            <motion.span
                                                key='copy'
                                                initial={ { scale: 0.6, opacity: 0 } }
                                                animate={ { scale: 1, opacity: 1 } }
                                                exit={ { scale: 0.6, opacity: 0 } }
                                                transition={ { duration: 0.18 } }
                                                className='absolute'>

                                                <HiOutlineSquare2Stack size={ 18 } />

                                            </motion.span>
                                        )
                                }

                            </AnimatePresence>

                        </span>

                    </Button>

                </div>

            </div>

            <div className='flex justify-center gap-3'>

                <Button
                    onClick={ onSend }
                    className='flex cursor-pointer flex-col items-center gap-1'>

                    <div className='btn-primary flex size-14 items-center justify-center rounded-2xl'>

                        <FiArrowUpRight size={ 22 } />

                    </div>

                    <span className='text-tiny text-txt-muted'>

                        { T('Dashboard.Send.Title') }

                    </span>

                </Button>

                <Button
                    onClick={ onReceive }
                    className='flex cursor-pointer flex-col items-center gap-1'>

                    <div className='btn-normal flex size-14 items-center justify-center rounded-2xl'>

                        <FiArrowDownLeft size={ 22 } />

                    </div>

                    <span className='text-tiny text-txt-muted'>

                        { T('Dashboard.Receive.Title') }

                    </span>

                </Button>

                <Button
                    onClick={ onRedeem }
                    className='flex cursor-pointer flex-col items-center gap-1'>

                    <div className='btn-normal flex size-14 items-center justify-center rounded-2xl'>

                        <FiGift size={ 22 } />

                    </div>

                    <span className='text-tiny text-txt-muted'>

                        { T('Dashboard.Redeem.Title') }

                    </span>

                </Button>

            </div>

            <div className='flex flex-col gap-2'>

                <SectionHeader title={ T('Dashboard.Tokens.Title') }>

                    <Button
                        variant='muted'
                        onClick={ onTokens }
                        className='h-8 gap-1 rounded-lg px-3 text-tiny'>

                        <HiOutlineSquares2X2 size={ 14 } />

                        { T('Dashboard.Tokens.Manage') }

                    </Button>

                </SectionHeader>

                <TokenRow
                    panel
                    primary
                    src={ getNativeLogo(network.chainId) }
                    symbol={ network.symbol }
                    subtitle={ network.coin ?? network.name }>

                    <div dir='ltr' className='flex shrink-0 flex-col items-center'>

                        <div className='font-mono text-small text-txt-normal'>

                            { nativeLoading ? '…' : trimAmount(nativeFormatted) }

                        </div>

                        {
                            !nativeLoading && rowValue(getNativeCoinId(network.chainId), nativeFormatted) !== undefined && (
                                <div className='font-mono text-tiny text-txt-muted'>

                                    { rowValue(getNativeCoinId(network.chainId), nativeFormatted) }

                                </div>
                            )
                        }

                    </div>

                </TokenRow>

                {
                    tokens.map((item) => (
                        <TokenRow
                            key={ item.token.address }
                            panel
                            src={ getTokenLogo(network.chainId, item.token.address) }
                            symbol={ item.token.symbol }
                            subtitle={ item.token.name }>

                            <div dir='ltr' className='flex shrink-0 flex-col items-center'>

                                <div className='font-mono text-small text-txt-normal'>

                                    { trimAmount(item.formatted) }

                                </div>

                                {
                                    rowValue(item.token.coinId, item.formatted) !== undefined && (
                                        <div className='font-mono text-tiny text-txt-muted'>

                                            { rowValue(item.token.coinId, item.formatted) }

                                        </div>
                                    )
                                }

                            </div>

                        </TokenRow>
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
