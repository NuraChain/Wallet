import type { IconType } from 'react-icons';
import type { Network } from '../../core/network';
import type { TokenBalance } from '../../core/token';
import type { Transaction } from '../../hook/history';

import { AnimatePresence, motion } from 'motion/react';
import { IoChevronDown } from 'react-icons/io5';
import { FiArrowDownLeft, FiArrowUpRight, FiGift } from 'react-icons/fi';
import { HiOutlineCheck, HiOutlineCog6Tooth, HiOutlineSquare2Stack, HiOutlineSquares2X2, HiOutlineUser } from 'react-icons/hi2';

import TokenIcon from '../token.icon';
import TokenRow, { AssetAmount } from '../token.row';
import DashboardActivity from './dashboard.activity';
import DashboardOffline from './dashboard.offline';

import Text from '../ui/text';
import Button, { fillNormal, fillPrimary } from '../ui/button';
import IconBox from '../ui/iconbox';
import SectionHeader from '../ui/section';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { useClipboard } from '../../hook/clipboard';
import { getNativeCoinId, getNativeLogo, getTokenCoinId, getTokenLogo, type PriceMap } from '../../core/price';
import { formatUsd, shortAddress, trimAmount } from '../../utility/format';
import { Horizontal, Vertical } from '../ui/stack';

/**
 * The two selector capsules at the top of the tab are the same control with different contents, so
 * they are the same dimensions written once.
 */
const chipClass = 'h-9 min-w-0 flex-1 gap-1.5 rounded-surface ps-1 pe-2.5 text-tiny';

/**
 * And the label inside them, for the same reason.
 */
const chipLabelClass = 'min-w-0 flex-1 truncate text-start font-medium';

/**
 * What stands in for a figure that has never been read.
 *
 * Not `0`, and not `$0.00`. A wallet that cannot reach the chain knows nothing about what it holds,
 * and the two honest answers are the last figure it did read or no figure at all — a zero is neither,
 * and it is the one a user acts on.
 */
const unknownAmount = '—';

/**
 * A balance and everything the tab needs to know about how much to trust it.
 *
 * `at` is when the figure was read and `0` means never, which is what separates "you hold nothing"
 * from "this could not be read".
 */
interface BalanceView { formatted: string; loading: boolean; error: boolean; at: number }

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
 * @param {string} props.emoji The account's chosen badge, or an empty string for none.
 * @param {Network} props.network The active network.
 * @param {BalanceView} props.native The native balance, and how current it is.
 * @param {TokenBalance[]} props.tokens Balances of the tokens the user added.
 * @param {number} props.total Portfolio value in USD.
 * @param {boolean} props.totalLoading Whether prices are still loading.
 * @param {number} props.totalAt When the oldest price behind the total was read, or 0 for none at all.
 * @param {PriceMap} props.prices USD price per pricing id, used for the per-row value.
 * @param {() => void} props.onSend Opens the send modal.
 * @param {() => void} props.onReceive Opens the receive modal.
 * @param {() => void} props.onRedeem Opens the redeem modal.
 * @param {() => void} props.onNetwork Opens the network modal.
 * @param {() => void} props.onAccounts Opens the account switcher.
 * @param {() => void} props.onTokens Opens the token manager.
 * @param {() => void} props.onSettings Opens the settings modal.
 * @param {{ items: Transaction[]; loading: boolean; notice: string }} props.history The account's transaction history, and why it is empty when the explorer said so.
 * @param {(hash: string) => void} props.onTransaction Opens one transaction on the explorer.
 * @param {() => void} props.onOverview Opens the full history page.
 * @returns {JSX.Element} The wallet tab.
 */
export default function DashboardWallet({ address, name, emoji, network, native, tokens, total, totalLoading, totalAt, prices, history, onSend, onReceive, onRedeem, onNetwork, onAccounts, onTokens, onSettings, onTransaction, onOverview }: { address: string; name: string; emoji: string; network: Network; native: BalanceView; tokens: TokenBalance[]; total: number; totalLoading: boolean; totalAt: number; prices: PriceMap; history: { items: Transaction[]; loading: boolean; notice: string }; onSend: () => void; onReceive: () => void; onRedeem: () => void; onNetwork: () => void; onAccounts: () => void; onTokens: () => void; onSettings: () => void; onTransaction: (hash: string) => void; onOverview: () => void })
{
    // The icon carries the feedback, so it only has to stay swapped long enough to register.
    const clipboard = useClipboard();

    const copied = clipboard.state === 'done';

    // A total is only worth printing when both halves of it are known. The balance never having been
    // read is the obvious hole; prices that could not be resolved at all is the quieter one, and it
    // used to print the portfolio as `$0.00` — a wallet apparently worth nothing, on the strength of a
    // failed request to a price API.
    const totalKnown = native.at > 0 && totalAt > 0;

    /**
     * headline - The portfolio figure, or what stands in for it.
     *
     * Three outcomes, and they are not the same: still arriving, known, and unknowable. The last one is
     * the one worth being careful about — it used to print `$0.00`.
     * @returns {string} What to show as the headline.
     */
    const headline = () =>
    {
        if (totalLoading || native.loading)
        {
            return '…';
        }

        return totalKnown ? formatUsd(total) : unknownAmount;
    };

    /**
     * nativeAmount - The coin balance, on the same three-way rule as the headline.
     * @returns {string} What to show on the coin row.
     */
    const nativeAmount = () =>
    {
        if (native.loading)
        {
            return '…';
        }

        return native.at > 0 ? trimAmount(native.formatted) : unknownAmount;
    };

    /**
     * The three transfer controls. Same stacked shape, same dimensions; only the glyph, the fill and
     * the destination differ, so the row is data rather than three copies of one button.
     */
    const actionMap: { key: string; icon: IconType; fill: string; onClick: () => void }[] =
    [
        { key: 'Dashboard.Send.Title', icon: FiArrowUpRight, fill: fillPrimary, onClick: onSend },
        { key: 'Dashboard.Receive.Title', icon: FiArrowDownLeft, fill: fillNormal, onClick: onReceive },
        { key: 'Dashboard.Redeem.Title', icon: FiGift, fill: fillNormal, onClick: onRedeem }
    ];

    /**
     * RowValue - USD worth of one holding.
     *
     * A coin with no pricing id, or one whose price has not landed yet, resolves to `undefined` so the
     * caller can leave the line out entirely rather than print a misleading `$0.00`.
     * @param {string} coinId The pricing id.
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

    return (
        <Vertical className='mt-2 gap-4'>

            <Horizontal className='items-center gap-2'>

                <Button
                    variant='chip'
                    onClick={ onAccounts }
                    className={ chipClass }>

                    { /* The badge the account switcher set, or the generic person until one is chosen. */ }
                    <IconBox tone='badge' className={ cn('size-7', emoji.length > 0 && 'text-small') }>

                        {
                            emoji.length > 0 ? emoji : <HiOutlineUser size={ 14 } />
                        }

                    </IconBox>

                    { /*
                      * `captionStrong` is the chip's own pairing — the `text-tiny` on the capsule and
                      * the `text-txt-normal` on its fill — so naming it here changes nothing on screen.
                      */ }
                    <Text
                        variant='captionStrong'
                        className={ chipLabelClass }
                        text={ name } />

                    <IoChevronDown size={ 12 } className='shrink-0 opacity-40' />

                </Button>

                <Button
                    variant='chip'
                    onClick={ onNetwork }
                    className={ chipClass }>

                    <TokenIcon
                        primary
                        kind='network'
                        src={ getNativeLogo(network.chainId) }
                        symbol={ network.symbol }
                        className='size-7 shrink-0 text-tiny' />

                    <Text
                        variant='captionStrong'
                        className={ chipLabelClass }
                        text={ network.name } />

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

            </Horizontal>

            <DashboardOffline error={ native.error } at={ native.at } />

            <Vertical className='items-center gap-2 py-2'>

                <Text
                    dir='ltr'
                    variant='title'
                    className='text-display'
                    text={ headline() } />

                <Vertical className='items-center'>

                    <Button
                        onClick={ () => { void clipboard.copy(address); } }
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

                </Vertical>

            </Vertical>

            <Horizontal className='justify-center gap-3'>

                {
                    actionMap.map((item) => (
                        <Button
                            key={ item.key }
                            onClick={ item.onClick }
                            className='flex cursor-pointer flex-col items-center gap-1'>

                            <Horizontal className={ `${ item.fill } size-14 items-center justify-center rounded-dialog` }>

                                <item.icon size={ 22 } />

                            </Horizontal>

                            <Text text={ T(item.key) } />

                        </Button>
                    ))
                }

            </Horizontal>

            <Vertical className='gap-2'>

                <SectionHeader title={ T('Dashboard.Tokens.Title') }>

                    <Button
                        variant='muted'
                        size='small'
                        onClick={ onTokens }
                        leftIcon={ <HiOutlineSquares2X2 size={ 14 } /> }
                        text={ T('Dashboard.Tokens.Manage') } />

                </SectionHeader>

                <TokenRow
                    panel
                    primary
                    kind='network'
                    src={ getNativeLogo(network.chainId) }
                    symbol={ network.symbol }
                    subtitle={ network.coin ?? network.name }>

                    { /*
                      * The coin's own row follows the same rule as the headline: an amount that was
                      * never read is a dash, not a zero. Its USD line is left out with it, since
                      * pricing a balance nobody knows would be twice the invention.
                      */ }
                    <AssetAmount
                        amount={ nativeAmount() }
                        value={ native.loading || native.at === 0 ? undefined : rowValue(getNativeCoinId(network.chainId), native.formatted) } />

                </TokenRow>

                {
                    tokens.map((item) => (
                        <TokenRow
                            key={ item.token.address }
                            panel
                            kind='token'
                            src={ getTokenLogo(network.chainId, item.token.address) }
                            symbol={ item.token.symbol }
                            subtitle={ item.token.name }>

                            <AssetAmount
                                amount={ trimAmount(item.formatted) }
                                value={ rowValue(getTokenCoinId(network.chainId, item.token.address, item.token.coinId), item.formatted) } />

                        </TokenRow>
                    ))
                }

            </Vertical>

            <DashboardActivity
                items={ history.items }
                loading={ history.loading }
                notice={ history.notice }
                canOpen={ network.explorerUrl.length > 0 }
                onOpen={ onTransaction }
                onOverview={ onOverview } />

        </Vertical>
    );
}
