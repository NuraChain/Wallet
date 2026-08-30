import type { IconType } from 'react-icons';

import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiArrowDownLeft, FiArrowUpRight, FiGift, FiLogOut } from 'react-icons/fi';
import { HiOutlineCog6Tooth, HiOutlineGlobeAlt, HiOutlineListBullet, HiOutlineWallet } from 'react-icons/hi2';

import ScrollArea from '../layout/scroll';
import PageContainer, { ScrollFrame } from '../layout/container';
import DashboardNav from '../components/dashboard/dashboard.nav';
import DashboardSidebar, { type SidebarItem } from '../components/dashboard/dashboard.sidebar';
import DashboardWallet from '../components/dashboard/dashboard.wallet';

import { getNetwork } from '../core/network';
import { RouteFallback } from '../layout/root';
import { loadConnections } from '../core/dapp';
import { forgetDappPages, startDappBridge } from '../core/dapp.bridge';
import { lockSession, useVault } from '../core/session';
import { answerDapp, rejectDappPrompts, setDappAccount, setDappWatchAsset, subscribeDappChange, syncDappState, useDappPrompt } from '../core/dapp.rpc';
import { vaultAddress, vaultDerivable, type Vault } from '../core/vault';
import { usePrices } from '../hook/price';
import { useOnline } from '../hook/connection';
import { useHistory } from '../hook/history';
import { useBalance, useTokens } from '../hook/balance';
import { getDirection, T } from '../utility/language';
import {
    discoverTokens,
    hideToken,
    loadHiddenTokens,
    loadTokens,
    readToken,
    saveHiddenTokens,
    saveTokens,
    unhideToken,
    type HiddenMap,
    type TokenMap
} from '../core/token';
import { discoveryDue, discoveryKey, markDiscovered } from '../core/token.cache';
import { accountFirst, defaultAccountName, loadAccounts, saveAccounts, saveActiveAccount, type Account } from '../utility/account';

/* oxlint-disable @typescript-eslint/naming-convention */
const DashboardSend = lazy(async () => import('../components/dashboard/dashboard.send'));
const DashboardTokens = lazy(async () => import('../components/dashboard/dashboard.tokens'));
const IntroLanguage = lazy(async () => import('../components/intro/intro.language'));
const DashboardLogout = lazy(async () => import('../components/dashboard/dashboard.logout'));
const DashboardAccount = lazy(async () => import('../components/dashboard/dashboard.account'));
const DashboardNetwork = lazy(async () => import('../components/dashboard/dashboard.network'));
const DashboardReceive = lazy(async () => import('../components/dashboard/dashboard.receive'));
const DashboardRedeem = lazy(async () => import('../components/dashboard/dashboard.redeem'));
const DashboardBrowser = lazy(async () => import('../components/dashboard/dashboard.browser'));
const DashboardRequest = lazy(async () => import('../components/dashboard/dashboard.request'));
const DashboardHistory = lazy(async () => import('../components/dashboard/dashboard.history'));
const DashboardPhrase = lazy(async () => import('../components/dashboard/dashboard.phrase'));
const DashboardSettings = lazy(async () => import('../components/dashboard/dashboard.settings'));
/* oxlint-enable @typescript-eslint/naming-convention */

type Modal = 'none' | 'send' | 'receive' | 'network' | 'language' | 'logout' | 'settings' | 'accounts' | 'tokens' | 'history' | 'phrase' | 'redeem';

const navMap: { key: string; icon: IconType }[] = [
    { key: 'Wallet', icon: HiOutlineWallet },
    { key: 'Browser', icon: HiOutlineGlobeAlt }
];

function DashboardView({ vault }: { vault: Vault }) {
    const navigate = useNavigate();

    const [active, setActive] = useState(0);
    const [account, setAccount] = useState(0);
    const [navHidden, setNavHidden] = useState(false);
    const [modal, setModal] = useState<Modal>('none');
    const [link, setLink] = useState({ url: '', ticket: 0 });
    const [network, setNetworkState] = useState(getNetwork());
    const [tokenMap, setTokenMap] = useState<TokenMap>({});
    const [loaded, setLoaded] = useState(false);
    const [scan, setScan] = useState(0);

    const lastScan = useRef(0);

    const [hidden, setHidden] = useState<HiddenMap>({});

    const tokenRef = useRef(tokenMap);
    const hiddenRef = useRef(hidden);
    const [accounts, setAccounts] = useState<Account[]>([{ index: 0, name: defaultAccountName(0) }]);

    const address = useMemo(() => vaultAddress(vault, account), [vault, account]);

    const derivable = vaultDerivable(vault);

    const goTab = useCallback((index: number) => {
        setActive(index);
        setNavHidden(false);
    }, []);

    const closeModal = useCallback(() => {
        setModal('none');
    }, []);
    const backToSettings = useCallback(() => {
        setModal('settings');
    }, []);

    const current = accounts.find((item) => item.index === account);

    const name = current?.name ?? defaultAccountName(account);
    const emoji = current?.emoji ?? '';

    const tracked = useMemo(() => tokenMap[network.chainId] ?? [], [tokenMap, network.chainId]);

    const barHidden = navHidden || navMap[active].key === 'Browser';

    const online = useOnline();

    const prompt = useDappPrompt();

    const native = useBalance(address, network);
    const tokens = useTokens(address, network, tracked);
    const prices = usePrices(network, native.formatted, tokens.tokens);
    const history = useHistory(address, network, tracked);

    const reads = useMemo(
        () => ({
            formatted: native.formatted,
            loading: native.loading,

            error: native.error || tokens.error,

            at: native.at
        }),
        [native.formatted, native.loading, native.error, native.at, tokens.error]
    );

    useEffect(() => {
        const run = async () => {
            const [stored, storedTokens, dismissed] = await Promise.all([loadAccounts(), loadTokens(), loadHiddenTokens()]);

            const single = stored.accounts.find((item) => item.index === 0) ?? { index: 0, name: defaultAccountName(0) };

            setAccounts(derivable ? stored.accounts : [single]);
            setAccount(derivable ? stored.active : 0);

            setTokenMap(storedTokens);
            setHidden(dismissed);
            setLoaded(true);
        };

        void run();
    }, []);

    useEffect(() => {
        tokenRef.current = tokenMap;
    }, [tokenMap]);

    useEffect(() => {
        hiddenRef.current = hidden;
    }, [hidden]);

    useEffect(() => {
        if (!loaded) {
            return undefined;
        }

        let live = true;

        const sweepKey = discoveryKey(address, network.chainId);
        const forced = scan !== lastScan.current;

        lastScan.current = scan;

        if (!online || (!forced && !discoveryDue(sweepKey))) {
            return undefined;
        }

        const run = async () => {
            const found = await discoverTokens(address, network, tokenRef.current[network.chainId] ?? [], hiddenRef.current[network.chainId] ?? []).catch(
                () => undefined
            );

            if (found === undefined) {
                return;
            }

            markDiscovered(sweepKey);

            if (!live || found.length === 0) {
                return;
            }

            const held = tokenRef.current;
            const list = held[network.chainId] ?? [];
            const fresh = found.filter((item) => !list.some((entry) => entry.address.toLowerCase() === item.address.toLowerCase()));

            if (fresh.length === 0) {
                return;
            }

            const next = { ...held, [network.chainId]: [...list, ...fresh] };

            setTokenMap(next);

            await saveTokens(next);
        };

        void run();

        return () => {
            live = false;
        };
    }, [loaded, address, network.chainId, scan, online]);

    const onAddToken = async (contract: string) => {
        if (tracked.some((item) => item.address.toLowerCase() === contract.toLowerCase())) {
            return T('Dashboard.Tokens.Exists');
        }

        try {
            const token = await readToken(network.chainId, contract);

            if (tracked.some((item) => item.address === token.address)) {
                return T('Dashboard.Tokens.Exists');
            }

            const next = { ...tokenMap, [network.chainId]: [...tracked, token] };

            setTokenMap(next);

            await saveTokens(next);

            const cleared = unhideToken(hidden, network.chainId, token.address);

            if (cleared !== hidden) {
                setHidden(cleared);

                await saveHiddenTokens(cleared);
            }

            return '';
        } catch {
            return T('Dashboard.Tokens.NotFound');
        }
    };

    const onRemoveToken = (contract: string) => {
        const next = { ...tokenMap, [network.chainId]: tracked.filter((item) => item.address !== contract) };

        setTokenMap(next);

        void saveTokens(next);

        const marked = hideToken(hidden, network.chainId, contract);

        if (marked !== hidden) {
            setHidden(marked);

            void saveHiddenTokens(marked);
        }
    };

    useEffect(() => {
        void loadConnections();

        const stop = startDappBridge(answerDapp);

        return () => {
            stop();

            rejectDappPrompts();

            setDappAccount('', 0);

            forgetDappPages();
        };
    }, []);

    useEffect(() => {
        setDappAccount(address, account);

        syncDappState();
    }, [address, account, network.chainId]);

    useEffect(
        () =>
            subscribeDappChange(() => {
                setNetworkState(getNetwork());
            }),
        []
    );

    useEffect(() => {
        setDappWatchAsset(async (contract: string) => {
            if (tracked.some((item) => item.address.toLowerCase() === contract.toLowerCase())) {
                return true;
            }

            return (await onAddToken(contract)).length === 0;
        });
    }, [tracked, tokenMap, hidden, network.chainId]);

    const onRefresh = async () => {
        native.refresh();
        tokens.refresh();
        history.refresh();

        setScan((value) => value + 1);

        await Promise.resolve();
    };

    const onSelectAccount = (index: number) => {
        if (!accounts.some((item) => item.index === index)) {
            const next = [...accounts, { index, name: defaultAccountName(index) }].sort((left, right) => left.index - right.index);

            setAccounts(next);

            void saveAccounts(next);
        }

        setAccount(index);

        void saveActiveAccount(index);
    };

    const onUpdateAccount = (index: number, patch: Partial<Account>) => {
        const next = accounts.some((item) => item.index === index)
            ? accounts.map((item) => (item.index === index ? { ...item, ...patch } : item))
            : [...accounts, { index, name: defaultAccountName(index), ...patch }].sort((left, right) => left.index - right.index);

        setAccounts(next);

        void saveAccounts(next);
    };

    const sidebarMap: SidebarItem[] = [
        {
            key: 'Wallet',
            label: T('Dashboard.Nav.Wallet'),
            icon: HiOutlineWallet,
            active: navMap[active].key === 'Wallet',
            onClick: () => {
                goTab(0);
            }
        },
        {
            key: 'Browser',
            label: T('Dashboard.Nav.Browser'),
            icon: HiOutlineGlobeAlt,
            active: navMap[active].key === 'Browser',
            onClick: () => {
                goTab(1);
            }
        },
        {
            key: 'Send',
            label: T('Dashboard.Send.Title'),
            icon: FiArrowUpRight,
            onClick: () => {
                setModal('send');
            }
        },
        {
            key: 'Receive',
            label: T('Dashboard.Receive.Title'),
            icon: FiArrowDownLeft,
            onClick: () => {
                setModal('receive');
            }
        },
        {
            key: 'Redeem',
            label: T('Dashboard.Redeem.Title'),
            icon: FiGift,
            onClick: () => {
                setModal('redeem');
            }
        },
        {
            key: 'History',
            label: T('Dashboard.Activity.Overview'),
            icon: HiOutlineListBullet,
            onClick: () => {
                setModal('history');
            }
        },
        {
            key: 'Settings',
            label: T('Dashboard.Settings.Title'),
            icon: HiOutlineCog6Tooth,
            onClick: () => {
                setModal('settings');
            }
        }
    ];

    const onRemoveAccount = (index: number) => {
        const next = accounts.filter((item) => item.index !== index);

        if (index < accountFirst || next.length === 0) {
            return;
        }

        setAccounts(next);

        void saveAccounts(next);

        if (account === index) {
            setAccount(next[0].index);

            void saveActiveAccount(next[0].index);
        }
    };

    const onPanelScroll = (index: number) => (top: number, delta: number, bottom: number) => {
        if (index !== active) {
            return;
        }

        if (top <= 24 || bottom <= 24) {
            setNavHidden(false);

            return;
        }

        if (delta > 6) {
            setNavHidden(true);
        } else if (delta < -6) {
            setNavHidden(false);
        }
    };

    const onBrowse = (url: string) => {
        setLink((value) => ({ url, ticket: value.ticket + 1 }));

        setModal('none');

        goTab(navMap.findIndex((item) => item.key === 'Browser'));
    };

    const onTransaction = (hash: string) => {
        if (network.explorerUrl.length === 0) {
            return;
        }

        onBrowse(`${network.explorerUrl.replace(/\/+$/u, '')}/tx/${hash}`);
    };

    const onNetworkChange = () => {
        setNetworkState(getNetwork());
    };

    const onSent = () => {
        native.refresh();
        tokens.refresh();
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'tween' }} className='relative size-full bg-base-1'>
            <Suspense fallback={null}>
                <AnimatePresence>
                    {modal === 'send' && (
                        <DashboardSend
                            key='send'
                            vault={vault}
                            index={account}
                            network={network}
                            nativeValue={native.value}
                            nativeFormatted={native.formatted}
                            tokens={tokens.tokens}
                            onSent={onSent}
                            onExplorer={onTransaction}
                            onClose={closeModal}
                        />
                    )}

                    {modal === 'receive' && <DashboardReceive key='receive' address={address} network={network} onClose={closeModal} />}

                    {modal === 'accounts' && (
                        <DashboardAccount
                            key='accounts'
                            vault={vault}
                            accounts={accounts}
                            active={account}
                            onSelect={onSelectAccount}
                            onUpdate={onUpdateAccount}
                            onRemove={onRemoveAccount}
                            onClose={closeModal}
                        />
                    )}

                    {modal === 'tokens' && (
                        <DashboardTokens
                            key='tokens'
                            network={network}
                            tokens={tokens.tokens}
                            prices={prices.prices}
                            onAdd={onAddToken}
                            onRemove={onRemoveToken}
                            onClose={closeModal}
                        />
                    )}

                    {modal === 'history' && (
                        <DashboardHistory
                            key='history'
                            items={history.items}
                            loading={history.loading}
                            notice={history.notice}
                            canOpen={network.explorerUrl.length > 0}
                            onOpen={onTransaction}
                            onClose={closeModal}
                        />
                    )}

                    {modal === 'network' && <DashboardNetwork key='network' network={network} onChange={onNetworkChange} onClose={closeModal} />}

                    {modal === 'language' && <IntroLanguage key='language' onClose={backToSettings} />}

                    {modal === 'redeem' && <DashboardRedeem key='redeem' address={address} onClose={closeModal} />}

                    {modal === 'phrase' && <DashboardPhrase key='phrase' kind={vault.kind} onClose={backToSettings} />}

                    {modal === 'logout' && <DashboardLogout key='logout' kind={vault.kind} onClose={backToSettings} />}

                    {modal === 'settings' && (
                        <DashboardSettings
                            key='settings'
                            kind={vault.kind}
                            onLanguage={() => {
                                setModal('language');
                            }}
                            onLock={() => {
                                lockSession();
                                void navigate('/unlock', { replace: true });
                            }}
                            onPhrase={() => {
                                setModal('phrase');
                            }}
                            onLogout={() => {
                                setModal('logout');
                            }}
                            onClose={closeModal}
                        />
                    )}

                    {prompt !== undefined && <DashboardRequest key={prompt.id} prompt={prompt} address={address} network={network.name} />}
                </AnimatePresence>
            </Suspense>

            <div dir={getDirection()} className='flex size-full overflow-hidden'>
                <DashboardSidebar
                    items={sidebarMap}
                    footer={{
                        key: 'Logout',
                        label: T('Dashboard.Logout.Title'),
                        icon: FiLogOut,
                        onClick: () => {
                            setModal('logout');
                        }
                    }}
                />

                <div className='min-w-0 flex-1 overflow-hidden'>
                    <div
                        className='flex size-full transition-transform duration-(--duration-surface) ease-out'
                        style={{ transform: `translateX(${getDirection() === 'rtl' ? active * 100 : active * -100}%)` }}
                    >
                        {navMap.map((item, index) => (
                            <div key={item.key} className='size-full shrink-0'>
                                {item.key === 'Browser' ? (
                                    <PageContainer
                                        variant='browser'
                                        role='tabpanel'
                                        id={`dashboard-panel-${item.key}`}
                                        aria-hidden={index === active ? undefined : true}
                                        inert={index === active ? undefined : true}
                                        aria-labelledby={`dashboard-tab-${item.key}`}
                                    >
                                        <Suspense fallback={null}>
                                            <DashboardBrowser
                                                address={address}
                                                network={network}
                                                request={link.url}
                                                ticket={link.ticket}
                                                enabled={index === active && modal === 'none' && prompt === undefined}
                                                onExit={() => {
                                                    goTab(0);
                                                }}
                                            />
                                        </Suspense>
                                    </PageContainer>
                                ) : (
                                    <ScrollFrame>
                                        <ScrollArea className='size-full' onRefresh={onRefresh} onScrollChange={onPanelScroll(index)}>
                                            <PageContainer
                                                variant='tab'
                                                role='tabpanel'
                                                id={`dashboard-panel-${item.key}`}
                                                aria-hidden={index === active ? undefined : true}
                                                inert={index === active ? undefined : true}
                                                aria-labelledby={`dashboard-tab-${item.key}`}
                                            >
                                                {item.key === 'Wallet' && (
                                                    <DashboardWallet
                                                        address={address}
                                                        name={name}
                                                        emoji={emoji}
                                                        network={network}
                                                        native={reads}
                                                        tokens={tokens.tokens}
                                                        total={prices.total}
                                                        totalLoading={prices.loading}
                                                        totalAt={prices.at}
                                                        prices={prices.prices}
                                                        history={history}
                                                        onSend={() => {
                                                            setModal('send');
                                                        }}
                                                        onReceive={() => {
                                                            setModal('receive');
                                                        }}
                                                        onRedeem={() => {
                                                            setModal('redeem');
                                                        }}
                                                        onNetwork={() => {
                                                            setModal('network');
                                                        }}
                                                        onAccounts={() => {
                                                            setModal('accounts');
                                                        }}
                                                        onTokens={() => {
                                                            setModal('tokens');
                                                        }}
                                                        onSettings={() => {
                                                            setModal('settings');
                                                        }}
                                                        onTransaction={onTransaction}
                                                        onOverview={() => {
                                                            setModal('history');
                                                        }}
                                                    />
                                                )}
                                            </PageContainer>
                                        </ScrollArea>
                                    </ScrollFrame>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <DashboardNav items={navMap} active={active} hidden={barHidden} onSelect={goTab} />
        </motion.div>
    );
}

export default function DashboardPage() {
    const vault = useVault();

    if (vault === undefined) {
        return <RouteFallback />;
    }

    return <DashboardView vault={vault} />;
}
