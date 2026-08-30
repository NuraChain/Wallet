import type { IconType } from 'react-icons';
import type { Network } from '../../core/network';
import type { TokenBalance } from '../../core/token';
import type { Transaction } from '../../hook/history';

import { Fragment } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { IoChevronDown } from 'react-icons/io5';
import { FiArrowDownLeft, FiArrowUpRight, FiGift } from 'react-icons/fi';
import { HiOutlineCheck, HiOutlineCog6Tooth, HiOutlineSquare2Stack, HiOutlineSquares2X2, HiOutlineUser } from 'react-icons/hi2';

import TokenIcon from '../token.icon';
import TokenRow, { AssetAmount } from '../token.row';
import DashboardActivity from './dashboard.activity';
import DashboardOffline from './dashboard.offline';

import Text from '../ui/text';
import Button from '../ui/button';
import IconBox from '../ui/iconbox';
import ListCard from '../ui/list';
import SectionHeader from '../ui/section';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { useClipboard } from '../../hook/clipboard';
import { getNativeCoinId, getNativeLogo, getTokenCoinId, getTokenLogo, type PriceMap } from '../../core/price';
import { formatUsd, shortAddress, trimAmount } from '../../utility/format';
import { Horizontal, Vertical } from '../ui/stack';

const chipClass = 'h-9 min-w-0 flex-1 gap-1.5 rounded-surface ps-1 pe-2.5 text-tiny';

const chipLabelClass = 'min-w-0 flex-1 truncate text-start font-medium';

const unknownAmount = '—';

interface BalanceView {
    formatted: string;
    loading: boolean;
    error: boolean;
    at: number;
}

export default function DashboardWallet({
    address,
    name,
    emoji,
    network,
    native,
    tokens,
    total,
    totalLoading,
    totalAt,
    prices,
    history,
    onSend,
    onReceive,
    onRedeem,
    onNetwork,
    onAccounts,
    onTokens,
    onSettings,
    onTransaction,
    onOverview
}: {
    address: string;
    name: string;
    emoji: string;
    network: Network;
    native: BalanceView;
    tokens: TokenBalance[];
    total: number;
    totalLoading: boolean;
    totalAt: number;
    prices: PriceMap;
    history: { items: Transaction[]; loading: boolean; notice: string };
    onSend: () => void;
    onReceive: () => void;
    onRedeem: () => void;
    onNetwork: () => void;
    onAccounts: () => void;
    onTokens: () => void;
    onSettings: () => void;
    onTransaction: (hash: string) => void;
    onOverview: () => void;
}) {
    const clipboard = useClipboard();

    const copied = clipboard.state === 'done';

    const totalKnown = native.at > 0 && totalAt > 0;

    const headline = () => {
        if (totalLoading || native.loading) {
            return '…';
        }

        return totalKnown ? formatUsd(total) : unknownAmount;
    };

    const nativeAmount = () => {
        if (native.loading) {
            return '…';
        }

        return native.at > 0 ? trimAmount(native.formatted) : unknownAmount;
    };

    const actionMap: { key: string; icon: IconType; primary: boolean; onClick: () => void }[] = [
        { key: 'Dashboard.Send.Title', icon: FiArrowUpRight, primary: true, onClick: onSend },
        { key: 'Dashboard.Receive.Title', icon: FiArrowDownLeft, primary: false, onClick: onReceive },
        { key: 'Dashboard.Redeem.Title', icon: FiGift, primary: false, onClick: onRedeem }
    ];

    const rowValue = (coinId: string, formatted: string) => {
        const price = prices[coinId];

        if (price === undefined) {
            return undefined;
        }

        return formatUsd(Number(formatted) * price);
    };

    return (
        <Vertical className='mt-2 gap-4'>
            <Horizontal className='items-center gap-2'>
                <Button variant='chip' onClick={onAccounts} className={chipClass}>
                    <IconBox tone='badge' className={cn('size-7', emoji.length > 0 && 'text-small')}>
                        {emoji.length > 0 ? emoji : <HiOutlineUser size={14} />}
                    </IconBox>

                    <Text variant='captionStrong' className={chipLabelClass} text={name} />

                    <IoChevronDown size={12} className='shrink-0 opacity-40' />
                </Button>

                <Button variant='chip' onClick={onNetwork} className={chipClass}>
                    <TokenIcon primary kind='network' src={getNativeLogo(network.chainId)} symbol={network.symbol} className='size-7 shrink-0 text-tiny' />

                    <Text variant='captionStrong' className={chipLabelClass} text={network.name} />

                    <IoChevronDown size={12} className='shrink-0 opacity-40' />
                </Button>

                <Button variant='chip' size='iconChip' onClick={onSettings} aria-label={T('Dashboard.Settings.Title')} className='shrink-0'>
                    <HiOutlineCog6Tooth size={17} />
                </Button>
            </Horizontal>

            <DashboardOffline error={native.error} at={native.at} />

            <Vertical className='items-start gap-1.5 py-2 ps-1'>
                <Text dir='ltr' variant='display' className='break-all' text={headline()} />

                <Button
                    onClick={() => {
                        void clipboard.copy(address);
                    }}
                    className='flex cursor-pointer items-center gap-1 text-tiny text-txt-muted hover:text-txt-normal'
                >
                    <span className='sr-only'>{T('Dashboard.Copy')}</span>

                    <span dir='ltr' className='font-mono'>
                        {shortAddress(address)}
                    </span>

                    <span className='relative flex size-5 shrink-0 items-center justify-center'>
                        <AnimatePresence initial={false} mode='wait'>
                            {copied ? (
                                <motion.span
                                    key='done'
                                    initial={{ scale: 0.4, opacity: 0 }}
                                    animate={{ scale: [0.4, 1.35, 1], opacity: 1 }}
                                    exit={{ scale: 0.4, opacity: 0 }}
                                    transition={{ duration: 0.35 }}
                                    className='absolute text-txt-normal'
                                >
                                    <HiOutlineCheck size={18} />
                                </motion.span>
                            ) : (
                                <motion.span
                                    key='copy'
                                    initial={{ scale: 0.6, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.6, opacity: 0 }}
                                    transition={{ duration: 0.18 }}
                                    className='absolute'
                                >
                                    <HiOutlineSquare2Stack size={18} />
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </span>
                </Button>
            </Vertical>

            <Horizontal className='overflow-hidden rounded-surface border border-line bg-base-2'>
                {actionMap.map((item, index) => (
                    <Fragment key={item.key}>
                        {index > 0 && <span aria-hidden className='w-px shrink-0 bg-line' />}

                        <Button
                            onClick={item.onClick}
                            className={cn(
                                'flex h-14 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 transition-colors duration-(--duration-fast)',
                                item.primary
                                    ? 'bg-btn-primary text-txt-on-primary hover:bg-btn-primary-hover active:bg-btn-primary-active'
                                    : 'text-txt-normal hover:bg-btn-muted-hover active:bg-btn-muted-active'
                            )}
                        >
                            <item.icon size={18} className='shrink-0' />

                            <Text variant='inherit' className='truncate text-small font-medium' text={T(item.key)} />
                        </Button>
                    </Fragment>
                ))}
            </Horizontal>

            <Vertical className='gap-2'>
                <SectionHeader title={T('Dashboard.Tokens.Title')}>
                    <Button variant='muted' size='small' onClick={onTokens} leftIcon={<HiOutlineSquares2X2 size={14} />} text={T('Dashboard.Tokens.Manage')} />
                </SectionHeader>

                <ListCard>
                    <TokenRow
                        grouped
                        primary
                        kind='network'
                        src={getNativeLogo(network.chainId)}
                        symbol={network.symbol}
                        subtitle={network.coin ?? network.name}
                    >
                        <AssetAmount
                            amount={nativeAmount()}
                            value={native.loading || native.at === 0 ? undefined : rowValue(getNativeCoinId(network.chainId), native.formatted)}
                        />
                    </TokenRow>

                    {tokens.map((item) => (
                        <TokenRow
                            grouped
                            key={item.token.address}
                            kind='token'
                            src={getTokenLogo(network.chainId, item.token.address)}
                            symbol={item.token.symbol}
                            subtitle={item.token.name}
                        >
                            <AssetAmount
                                amount={trimAmount(item.formatted)}
                                value={rowValue(getTokenCoinId(network.chainId, item.token.address, item.token.coinId), item.formatted)}
                            />
                        </TokenRow>
                    ))}
                </ListCard>
            </Vertical>

            <DashboardActivity
                items={history.items}
                loading={history.loading}
                notice={history.notice}
                canOpen={network.explorerUrl.length > 0}
                onOpen={onTransaction}
                onOverview={onOverview}
            />
        </Vertical>
    );
}
