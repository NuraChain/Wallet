import { Navigate, useNavigate } from 'react-router';
import { platform } from '../platform';
import { motion, AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, LogOut, Settings, Globe, Lock, Wallet } from 'lucide-react';

import ScrollArea from '../layout/scroll';
import PageContainer, { ScrollFrame } from '../layout/container';
import DashboardSidebar from '../component/dashboard/dashboard.sidebar';
import DashboardWallet from '../component/dashboard/dashboard.wallet';
import DashboardSend from '../component/dashboard/dashboard.send';
import IntroLanguage from '../component/intro/intro.language';
import DashboardTokens from '../component/dashboard/dashboard.tokens';
import DashboardLogout from '../component/dashboard/dashboard.logout';
import DashboardPhrase from '../component/dashboard/dashboard.phrase';
import DashboardRedeem from '../component/dashboard/dashboard.redeem';
import DashboardAccount from '../component/dashboard/dashboard.account';
import DashboardBrowser from '../component/dashboard/dashboard.browser';
import DashboardHistory from '../component/dashboard/dashboard.history';
import DashboardNetwork from '../component/dashboard/dashboard.network';
import DashboardReceive from '../component/dashboard/dashboard.receive';
import DashboardRequest from '../component/dashboard/dashboard.request';
import DashboardSettings from '../component/dashboard/dashboard.settings';
import DashboardMouse from '../component/dashboard/dashboard.mouse';

import { getNetwork } from '../core/network';
import { loadConnections } from '../core/dapp';
import { forgetDappPages, startDappBridge } from '../core/dapp.bridge';
import { flushDeepLinks } from '../core/deeplink';
import { lockSession } from '../core/session';
import { useVault } from '../hook/vault';
import { answerDapp, rejectDappPrompts, setDappAccount, setDappWatchAsset, subscribeDappChange, syncDappState } from '../core/dapp.rpc';
import { useDappPrompt } from '../hook/dapp';
import { vaultAddress, vaultDerivable } from '../core/vault';
import { usePrices } from '../hook/price';
import { useOnline } from '../hook/connection';
import { useHistory } from '../hook/history';
import { useBalance, useTokens } from '../hook/balance';
import { useHasBrowser } from '../hook/platform';
import Mouse from '../ui/mouse';

import { getDirection, T } from '../utility/language';
import { discoverTokens, hideToken, loadHiddenTokens, loadTokens, readToken, saveHiddenTokens, saveTokens, unhideToken } from '../core/token';
import { discoveryDue, discoveryKey, markDiscovered } from '../core/token.cache';
import { accountFirst, defaultAccountName, loadAccounts, saveAccounts, saveActiveAccount } from '../utility/account';
import type { MouseAction, SidebarItem } from '../type/app';
import type { Account, Vault } from '../type/wallet';
import type { HiddenMap, TokenMap } from '../type/token';

type Modal = 'none' | 'send' | 'receive' | 'network' | 'language' | 'logout' | 'accounts' | 'tokens' | 'history' | 'phrase' | 'redeem' | 'mouse';

const navMap: { key: string }[] = [{ key: 'Wallet' }, { key: 'Browser' }, { key: 'Settings' }];

function DashboardView({ vault }: { vault: Vault }) {
    const navigate = useNavigate();

    const [active, setActive] = useState(0);
    const [account, setAccount] = useState(0);
    const [modal, setModal] = useState<Modal>('none');
    const [browserFull, setBrowserFull] = useState(false);
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

    const hasBrowser = useHasBrowser();

    // Where nothing can render a page in-app — iOS, and the extension popup — the browser tab is
    // left out of the tab set rather than shipped as a panel that cannot load anything; everything
    // below indexes into this, not into navMap.
    const tabMap = useMemo(() => (hasBrowser ? navMap : navMap.filter((item) => item.key !== 'Browser')), [hasBrowser]);

    const goKey = useCallback(
        (key: string) => {
            const index = tabMap.findIndex((item) => item.key === key);

            if (index !== -1) {
                setActive(index);
            }
        },
        [tabMap]
    );

    const closeModal = useCallback(() => {
        setModal('none');
    }, []);

    const current = accounts.find((item) => item.index === account);

    const name = current?.name ?? defaultAccountName(account);
    const emoji = current?.emoji ?? '';

    const tracked = useMemo(() => tokenMap[network.chainId] ?? [], [tokenMap, network.chainId]);

    const online = useOnline();

    const prompt = useDappPrompt();

    const onMouse = (action: MouseAction) => {
        // A press behind a dialog would act on a screen nobody is looking at, or swap a half-filled
        // one for the mouse's own.
        if (modal !== 'none' || prompt !== undefined) {
            return;
        }

        if (action === 'double') {
            setModal('mouse');
        } else {
            goKey('Browser');
        }
    };

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

        flushDeepLinks();

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
            icon: Wallet,
            active: tabMap[active].key === 'Wallet',
            onClick: () => {
                goKey('Wallet');
            }
        },
        {
            key: 'Browser',
            label: T('Dashboard.Nav.Browser'),
            icon: Globe,
            active: tabMap[active].key === 'Browser',
            onClick: () => {
                goKey('Browser');
            }
        },
        {
            key: 'Settings',
            label: T('Dashboard.Settings.Title'),
            icon: Settings,
            active: tabMap[active].key === 'Settings',
            onClick: () => {
                goKey('Settings');
            }
        }
    ].filter((item) => tabMap.some((tab) => tab.key === item.key));

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

    const onBrowse = (url: string) => {
        // With no browser tab the link is handed to the host browser rather than dropped. The
        // wallet is no longer the provider for it, which an explorer link never needed.
        if (!hasBrowser) {
            void platform.openUrl(url).catch(() => undefined);

            return;
        }

        setLink((value) => ({ url, ticket: value.ticket + 1 }));

        setModal('none');

        goKey('Browser');
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

                {modal === 'language' && <IntroLanguage key='language' onClose={closeModal} />}

                {modal === 'redeem' && <DashboardRedeem key='redeem' address={address} onClose={closeModal} />}

                {modal === 'mouse' && <DashboardMouse key='mouse' onClose={closeModal} />}

                {modal === 'phrase' && <DashboardPhrase key='phrase' kind={vault.kind} onClose={closeModal} />}

                {modal === 'logout' && <DashboardLogout key='logout' kind={vault.kind} onClose={closeModal} />}

                {prompt !== undefined && (
                    <DashboardRequest key={prompt.id} prompt={prompt} name={name} emoji={emoji} address={address} network={network.name} tokens={tracked} />
                )}
            </AnimatePresence>

            {hasBrowser && <Mouse onAction={onMouse} />}

            <div dir={getDirection()} className='flex size-full overflow-hidden'>
                {/* Full screen is the browser's own mode, so the rail only steps aside while that
                    tab is the one on screen — no reset to forget on the way out. */}
                {!(browserFull && tabMap[active].key === 'Browser') && (
                    <DashboardSidebar
                        items={sidebarMap}
                        actions={[
                            {
                                key: 'Send',
                                label: T('Dashboard.Send.Title'),
                                icon: ArrowUpRight,
                                onClick: () => {
                                    setModal('send');
                                }
                            },
                            {
                                key: 'Receive',
                                label: T('Dashboard.Receive.Title'),
                                icon: ArrowDownLeft,
                                onClick: () => {
                                    setModal('receive');
                                }
                            }
                        ]}
                        footer={[
                            {
                                key: 'Lock',
                                label: T('Dashboard.Lock'),
                                icon: Lock,
                                primary: true,
                                onClick: () => {
                                    lockSession();
                                    void navigate('/unlock', { replace: true });
                                }
                            },
                            {
                                key: 'Logout',
                                label: T('Dashboard.Logout.Title'),
                                icon: LogOut,
                                destructive: true,
                                onClick: () => {
                                    setModal('logout');
                                }
                            }
                        ]}
                    />
                )}

                <div className='min-w-0 flex-1 overflow-hidden'>
                    <div
                        className='flex size-full transition-transform duration-(--duration-surface) ease-out'
                        style={{ transform: `translateX(${getDirection() === 'rtl' ? active * 100 : active * -100}%)` }}
                    >
                        {tabMap.map((item, index) => (
                            <div key={item.key} className='size-full shrink-0'>
                                {item.key === 'Browser' ? (
                                    <PageContainer
                                        variant='browser'
                                        aria-hidden={index === active ? undefined : true}
                                        inert={index === active ? undefined : true}
                                    >
                                        <DashboardBrowser
                                            network={network}
                                            request={link.url}
                                            ticket={link.ticket}
                                            onFullscreen={setBrowserFull}
                                            enabled={index === active && modal === 'none' && prompt === undefined}
                                            onExit={() => {
                                                goKey('Wallet');
                                            }}
                                        />
                                    </PageContainer>
                                ) : (
                                    <ScrollFrame>
                                        <ScrollArea className='size-full' onRefresh={onRefresh}>
                                            <PageContainer
                                                variant='tab'
                                                aria-hidden={index === active ? undefined : true}
                                                inert={index === active ? undefined : true}
                                            >
                                                {item.key === 'Settings' && (
                                                    <DashboardSettings
                                                        kind={vault.kind}
                                                        onBack={() => {
                                                            goKey('Wallet');
                                                        }}
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
                                                    />
                                                )}

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
                                                            goKey('Settings');
                                                        }}
                                                        onBrowser={
                                                            hasBrowser
                                                                ? () => {
                                                                      goKey('Browser');
                                                                  }
                                                                : undefined
                                                        }
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
        </motion.div>
    );
}

export default function DashboardPage() {
    const vault = useVault();

    // The loader only guards the way in. A lock that lands while the dashboard is open — the
    // extension's idle deadline, a second window's Lock — used to leave this on a spinner forever,
    // since nothing moved the route. The launch route decides where it goes: unlock for a wallet
    // still in storage, intro for one a logout just wiped.
    if (vault === undefined) {
        return <Navigate to='/' replace />;
    }

    return <DashboardView vault={vault} />;
}
