import type { Network } from '../../core/network';
import type { TokenBalance } from '../../core/token';
import type { Transaction } from '../../hook/history';

import { useState } from 'react';
import { ChevronDown, ArrowDownLeft, ArrowUpRight, Gift, Globe, Settings, List, LayoutGrid, User, type LucideIcon } from 'lucide-react';

import TokenIcon from '../token.icon';
import CopyButton from '../../ui/copy';
import TokenRow, { AssetAmount } from '../token.row';
import DashboardActivity from './dashboard.activity';
import DashboardOffline from './dashboard.offline';

import Text from '../../ui/text';
import Button from '../../ui/button';
import { Tab, TabBar } from '../../ui/tabs';
import IconBox from '../../ui/iconbox';
import ListCard from '../../ui/list';
import StatusBlock from '../../ui/state';

import { T } from '../../utility/language';
import { getNativeCoinId, getNativeLogo, getTokenCoinId, getTokenLogo, type PriceMap } from '../../core/price';
import { formatUsd, shortAddress, trimAmount } from '../../utility/format';
import { Horizontal, Vertical } from '../../ui/stack';

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
    onBrowser,
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
    /** Left out where nothing can render a page in-app. */
    onBrowser?: () => void;
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
        <Vertical mt={2} squeeze='y' grow gap={4}>
            <Horizontal align='center' gap={2}>
                <Button variant='chip' size='selector' squeeze='x' grow onClick={onAccounts}>
                    <IconBox tone='badge' size={7} glyph={emoji.length > 0 ? 'small' : undefined}>
                        {emoji.length > 0 ? emoji : <User size={14} />}
                    </IconBox>

                    <Text variant='captionStrong' squeeze='x' grow truncate align='start' weight='medium' text={name} />

                    <ChevronDown size={12} className='shrink-0 opacity-40' />
                </Button>

                <Button variant='chip' size='selector' squeeze='x' grow onClick={onNetwork}>
                    <TokenIcon primary kind='network' src={getNativeLogo(network.chainId)} symbol={network.symbol} size={7} glyph='tiny' />

                    <Text variant='captionStrong' squeeze='x' grow truncate align='start' weight='medium' text={network.name} />

                    <ChevronDown size={12} className='shrink-0 opacity-40' />
                </Button>

                {onBrowser !== undefined && (
                    <Button variant='chip' size='iconChip' onClick={onBrowser} aria-label={T('Dashboard.Nav.Browser')} shrink={false} wide='hide'>
                        <Globe size={17} />
                    </Button>
                )}

                <Button variant='chip' size='iconChip' onClick={onSettings} aria-label={T('Dashboard.Settings.Title')} shrink={false} wide='hide'>
                    <Settings size={17} />
                </Button>
            </Horizontal>

            <DashboardOffline error={native.error} at={native.at} />

            <Vertical align='center' gap={1.5} py={2}>
                <Text dir='ltr' variant='display' align='center' breaks='all' text={headline()} />

                <CopyButton trailing value={address} label={T('Dashboard.Copy')} subtle>
                    <span dir='ltr' className='font-mono'>
                        {shortAddress(address)}
                    </span>
                </CopyButton>
            </Vertical>

            <Horizontal justify='center' gap={2}>
                {actionMap.map((item) => (
                    <Button key={item.key} variant={item.primary ? 'primary' : 'chip'} onClick={item.onClick} size='tile' shrink={false}>
                        <item.icon size={18} className='shrink-0' />

                        <Text variant='inherit' truncate weight='medium' text={T(item.key)} />
                    </Button>
                ))}
            </Horizontal>

            <Vertical squeeze='y' grow gap={3}>
                <TabBar>
                    {tabMap.map((item) => (
                        <Tab
                            key={item.key}
                            id={`wallet-tab-${item.key}`}
                            panel={`wallet-panel-${item.key}`}
                            label={item.label}
                            selected={item.key === tab}
                            onSelect={() => {
                                setTab(item.key);
                            }}
                        />
                    ))}

                    {trailing !== undefined && (
                        <Button variant='muted' size='icon' aria-label={trailing.label} onClick={trailing.onClick} ms='auto' shrink={false}>
                            <trailing.icon size={16} />
                        </Button>
                    )}
                </TabBar>

                <Vertical squeeze='y' grow role='tabpanel' id={`wallet-panel-${tab}`} aria-labelledby={`wallet-tab-${tab}`}>
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

                    {tab === 'nft' && <StatusBlock panel fill text={T('Dashboard.Wallet.NftEmpty')} />}

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
