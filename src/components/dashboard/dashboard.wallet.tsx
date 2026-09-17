import type { Network } from '../../core/network';
import type { TokenBalance } from '../../core/token';
import type { Transaction } from '../../hook/history';

import { useState } from 'react';
import { ChevronDown, ArrowDownLeft, ArrowUpRight, Gift, Settings, List, LayoutGrid, User, type LucideIcon } from 'lucide-react';

import TokenIcon from '../token.icon';
import CopyButton from '../ui/copy';
import TokenRow, { AssetAmount } from '../token.row';
import DashboardActivity from './dashboard.activity';
import DashboardOffline from './dashboard.offline';

import Text from '../ui/text';
import Button from '../ui/button';
import IconBox from '../ui/iconbox';
import ListCard from '../ui/list';
import StatusBlock from '../ui/state';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { getNativeCoinId, getNativeLogo, getTokenCoinId, getTokenLogo, type PriceMap } from '../../core/price';
import { formatUsd, shortAddress, trimAmount } from '../../utility/format';
import { Horizontal, Vertical } from '../ui/stack';

const chipClass = 'h-9 min-w-0 flex-1 gap-1.5 rounded-surface ps-1 pe-2.5 text-tiny';

const chipLabelClass = 'min-w-0 flex-1 truncate text-start font-medium';

const unknownAmount = '—';

type TabKey = 'token' | 'nft' | 'activity';

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
    const [tab, setTab] = useState<TabKey>('token');

    const totalKnown = native.at > 0 && totalAt > 0;

    const headline = () => {
        if (totalLoading || native.loading) {
            return '…';
        }

        if (totalKnown) {
            return formatUsd(total);
        }

        /* No price feed — a custom chain, or the feed is down. The balance itself is known, so the
           screen says what it knows instead of putting a dash where its whole purpose goes. */
        return native.at > 0 ? `${trimAmount(native.formatted)} ${network.symbol}` : unknownAmount;
    };

    const nativeAmount = () => {
        if (native.loading) {
            return '…';
        }

        return native.at > 0 ? trimAmount(native.formatted) : unknownAmount;
    };

    const tabMap = [
        { key: 'token', label: T('Dashboard.Tokens.Title') },
        { key: 'nft', label: T('Dashboard.Wallet.Nft') },
        { key: 'activity', label: T('Dashboard.Wallet.Activity') }
    ] as const;

    const trailingMap: Record<TabKey, { icon: LucideIcon; label: string; onClick: () => void } | undefined> = {
        token: { icon: LayoutGrid, label: T('Dashboard.Tokens.Manage'), onClick: onTokens },
        nft: undefined,
        activity: { icon: List, label: T('Dashboard.Activity.Overview'), onClick: onOverview }
    };

    const trailing = trailingMap[tab];

    const actionMap: { key: string; icon: LucideIcon; primary: boolean; onClick: () => void }[] = [
        { key: 'Dashboard.Send.Title', icon: ArrowUpRight, primary: true, onClick: onSend },
        { key: 'Dashboard.Receive.Title', icon: ArrowDownLeft, primary: false, onClick: onReceive },
        { key: 'Dashboard.Redeem.Title', icon: Gift, primary: false, onClick: onRedeem }
    ];

    const rowPrice = (coinId: string) => {
        const price = prices[coinId];

        return price === undefined ? undefined : formatUsd(price);
    };

    const rowValue = (coinId: string, formatted: string) => {
        const price = prices[coinId];

        if (price === undefined) {
            return undefined;
        }

        return formatUsd(Number(formatted) * price);
    };

    return (
        <Vertical className='mt-2 min-h-0 flex-1 gap-4'>
            <Horizontal className='items-center gap-2'>
                <Button variant='chip' onClick={onAccounts} className={chipClass}>
                    <IconBox tone='badge' className={cn('size-7', emoji.length > 0 && 'text-small')}>
                        {emoji.length > 0 ? emoji : <User size={14} />}
                    </IconBox>

                    <Text variant='captionStrong' className={chipLabelClass} text={name} />

                    <ChevronDown size={12} className='shrink-0 opacity-40' />
                </Button>

                <Button variant='chip' onClick={onNetwork} className={chipClass}>
                    <TokenIcon primary kind='network' src={getNativeLogo(network.chainId)} symbol={network.symbol} className='size-7 shrink-0 text-tiny' />

                    <Text variant='captionStrong' className={chipLabelClass} text={network.name} />

                    <ChevronDown size={12} className='shrink-0 opacity-40' />
                </Button>

                <Button variant='chip' size='iconChip' onClick={onSettings} aria-label={T('Dashboard.Settings.Title')} className='shrink-0 lg:hidden'>
                    <Settings size={17} />
                </Button>
            </Horizontal>

            <DashboardOffline error={native.error} at={native.at} />

            <Vertical className='items-center gap-1.5 py-2'>
                <Text dir='ltr' variant='display' className='text-center break-all' text={headline()} />

                <CopyButton trailing value={address} label={T('Dashboard.Copy')} className='gap-1 text-tiny text-txt-muted hover:text-txt-normal'>
                    <span dir='ltr' className='font-mono'>
                        {shortAddress(address)}
                    </span>
                </CopyButton>
            </Vertical>

            <Horizontal className='justify-center gap-2'>
                {actionMap.map((item) => (
                    <Button
                        key={item.key}
                        variant={item.primary ? 'primary' : 'chip'}
                        onClick={item.onClick}
                        className='h-16 w-20 shrink-0 flex-col gap-1 rounded-surface'
                    >
                        <item.icon size={18} className='shrink-0' />

                        <Text variant='inherit' className='truncate font-medium' text={T(item.key)} />
                    </Button>
                ))}
            </Horizontal>

            <Vertical className='min-h-0 flex-1 gap-3'>
                <Horizontal role='tablist' className='items-center border-b border-line'>
                    {tabMap.map((item) => (
                        <Button
                            key={item.key}
                            role='tab'
                            id={`wallet-tab-${item.key}`}
                            aria-selected={item.key === tab}
                            aria-controls={`wallet-panel-${item.key}`}
                            onClick={() => {
                                setTab(item.key);
                            }}
                            className={cn(
                                'relative h-10 cursor-pointer px-3 text-small font-medium transition-colors duration-(--duration-fast)',
                                item.key === tab ? 'text-txt-accent' : 'text-txt-muted hover:text-txt-normal'
                            )}
                        >
                            {item.label}

                            {item.key === tab && <span aria-hidden className='absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-txt-accent' />}
                        </Button>
                    ))}

                    {trailing !== undefined && (
                        <Button variant='muted' size='icon' aria-label={trailing.label} onClick={trailing.onClick} className='ms-auto shrink-0'>
                            <trailing.icon size={16} />
                        </Button>
                    )}
                </Horizontal>

                <Vertical className='min-h-0 flex-1' role='tabpanel' id={`wallet-panel-${tab}`} aria-labelledby={`wallet-tab-${tab}`}>
                    {tab === 'token' && (
                        <ListCard>
                            <TokenRow
                                grouped
                                primary
                                kind='network'
                                src={getNativeLogo(network.chainId)}
                                symbol={network.symbol}
                                subtitle={network.coin ?? network.name}
                                price={rowPrice(getNativeCoinId(network.chainId))}
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
                                    src={getTokenLogo(network.chainId, item.token.address, item.token.symbol)}
                                    symbol={item.token.symbol}
                                    subtitle={item.token.name}
                                    price={rowPrice(getTokenCoinId(network.chainId, item.token.address, item.token.coinId))}
                                >
                                    <AssetAmount
                                        amount={trimAmount(item.formatted)}
                                        value={rowValue(getTokenCoinId(network.chainId, item.token.address, item.token.coinId), item.formatted)}
                                    />
                                </TokenRow>
                            ))}
                        </ListCard>
                    )}

                    {tab === 'nft' && <StatusBlock panel className='min-h-full justify-center' text={T('Dashboard.Wallet.NftEmpty')} />}

                    {tab === 'activity' && (
                        <DashboardActivity
                            items={history.items}
                            loading={history.loading}
                            notice={history.notice}
                            canOpen={network.explorerUrl.length > 0}
                            onOpen={onTransaction}
                        />
                    )}
                </Vertical>
            </Vertical>
        </Vertical>
    );
}
