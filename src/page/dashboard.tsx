import { Navigate, useNavigate } from 'react-router';
import { platform } from '../platform';
import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import ScrollArea from '../ui/scroll';
import PageContainer, { ScrollFrame } from '../ui/container';
import DashboardWallet from '../component/dashboard/dashboard.wallet';
import DashboardSend from '../component/dashboard/dashboard.send';
import IntroLanguage from '../component/intro/intro.language';
import DashboardTokens from '../component/dashboard/dashboard.tokens';
import DashboardDelete from '../component/dashboard/dashboard.delete';
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
import {
    allowDevices,
    answerDapp,
    forgetMicrophones,
    rejectDappPrompts,
    setDappAccount,
    setDappWatchAsset,
    subscribeDappChange,
    syncDappState
} from '../core/dapp.rpc';
import { useDappPrompt } from '../hook/dapp';
import { vaultAddress, vaultDerivable } from '../core/vault';
import { usePrices } from '../hook/price';
import { useOnline } from '../hook/connection';
import { useHistory } from '../hook/history';
import { useBalance, useTokens } from '../hook/balance';
import { useHasBrowser } from '../hook/platform';
import { forgetSiteThemes, getSiteDevices, setSiteTheme } from '../core/browser';
import { setMouseIcon, showMouse } from '../core/mouse';
import Mouse from '../ui/mouse';

import { getDirection, T } from '../utility/language';
import { discoverTokens, hideToken, loadHiddenTokens, loadTokens, readToken, saveHiddenTokens, saveTokens, unhideToken } from '../core/token';
import { discoveryDue, discoveryKey, markDiscovered } from '../core/token.cache';
import { accountFirst, defaultAccountName, loadAccounts, saveAccounts, saveActiveAccount } from '../utility/account';
import type { MouseAction, MouseIcon } from '../type/app';
import type { Account, Vault } from '../type/wallet';
import type { HiddenMap, TokenMap } from '../type/token';
import { Screen, Track } from '../ui/screen';
import { Horizontal } from '../ui/stack';
import { Block } from '../ui/wrap';

type Modal = 'none' | 'send' | 'receive' | 'network' | 'language' | 'delete' | 'accounts' | 'tokens' | 'history' | 'phrase' | 'redeem' | 'mouse';

const navMap: { key: string }[] = [{ key: 'Wallet' }, { key: 'Browser' }, { key: 'Settings' }];

const refreshLimit = 15_000;

function DashboardView({ vault }: { vault: Vault }) {
    const navigate = useNavigate();

    const [active, setActive] = useState(0);
    const [account, setAccount] = useState(0);
    const [modal, setModal] = useState<Modal>('none');
    const [fullToggle, setFullToggle] = useState(0);
    const [homePress, setHomePress] = useState(0);
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

    // No in-app browser on iOS or in the extension popup; index into this, not navMap.
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
        if (modal !== 'none' || prompt !== undefined) {
            return;
        }

        if (action === 'double') {
            if (tabMap[active].key === 'Browser') {
                setHomePress((value) => value + 1);
            } else {
                setModal('mouse');
            }
        } else if (tabMap[active].key === 'Browser') {
            setFullToggle((value) => value + 1);
        } else {
            goKey('Browser');
        }
    };

    const onMouseEvent = useEffectEvent(onMouse);

    const mouseIcon: MouseIcon = tabMap[active].key === 'Wallet' ? 'browser' : 'logo';

    // Runs before showMouse below, so a natively drawn mouse starts with the right icon.
    useEffect(() => {
        if (hasBrowser) {
            void setMouseIcon(mouseIcon);
        }
    }, [hasBrowser, mouseIcon]);

    // The mouse is drawn natively to stay above browser pages; this is the in-page fallback.
    const [pageMouse, setPageMouse] = useState(false);

    const mouseOn = hasBrowser && (tabMap[active].key !== 'Settings' || modal === 'mouse');

    useEffect(() => {
        if (!mouseOn) {
            return undefined;
        }

        return showMouse(
            (action) => {
                onMouseEvent(action);
            },
            () => {
                setPageMouse(true);
            }
        );
    }, [mouseOn]);

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

        const stop = startDappBridge(answerDapp, undefined, async (origin, wanted) => allowDevices(origin, wanted, await getSiteDevices(origin)), setSiteTheme);

        flushDeepLinks();

        return () => {
            stop();

            rejectDappPrompts();

            setDappAccount('', 0);

            forgetDappPages();

            forgetMicrophones();

            // A phone's status bar outlives the dashboard and would keep a site's colour on the lock screen.
            forgetSiteThemes();
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

    // Capped by refreshLimit, since ethers only times out after five minutes; the token sweep is not awaited.
    const onRefresh = async () => {
        setScan((value) => value + 1);

        await Promise.race([
            Promise.all([native.refresh(), tokens.refresh(), history.refresh()]),
            new Promise((resolve) => {
                setTimeout(resolve, refreshLimit);
            })
        ]);
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
        void native.refresh();
        void tokens.refresh();
    };

    return (
        <Screen enter='fade' backdrop>
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

                {modal === 'redeem' && <DashboardRedeem key='redeem' address={address} onBrowse={onBrowse} onClose={closeModal} />}

                {modal === 'mouse' && <DashboardMouse key='mouse' onClose={closeModal} />}

                {modal === 'phrase' && <DashboardPhrase key='phrase' kind={vault.kind} onClose={closeModal} />}

                {modal === 'delete' && <DashboardDelete key='delete' kind={vault.kind} onClose={closeModal} />}

                {prompt !== undefined && (
                    <DashboardRequest key={prompt.id} prompt={prompt} name={name} emoji={emoji} address={address} network={network.name} tokens={tracked} />
                )}
            </AnimatePresence>

            {pageMouse && mouseOn && <Mouse icon={mouseIcon} onAction={onMouse} />}

            <Horizontal dir={getDirection()} fill='both' clip>
                <Block squeeze='x' grow clip>
                    <Track index={active}>
                        {tabMap.map((item, index) => (
                            <Block key={item.key} fill shrink={false}>
                                {item.key === 'Browser' ? (
                                    <PageContainer variant='browser' inert={index === active ? undefined : true}>
                                        <DashboardBrowser
                                            network={network}
                                            request={link.url}
                                            ticket={link.ticket}
                                            fullToggle={fullToggle}
                                            homePress={homePress}
                                            inView={index === active}
                                            enabled={index === active && modal === 'none' && prompt === undefined}
                                            onExit={() => {
                                                goKey('Wallet');
                                            }}
                                        />
                                    </PageContainer>
                                ) : (
                                    <ScrollFrame>
                                        <ScrollArea fill onRefresh={item.key === 'Wallet' ? onRefresh : undefined}>
                                            <PageContainer variant='tab' inert={index === active ? undefined : true}>
                                                {item.key === 'Settings' && (
                                                    <DashboardSettings
                                                        kind={vault.kind}
                                                        onBack={() => {
                                                            goKey('Wallet');
                                                        }}
                                                        onLanguage={() => {
                                                            setModal('language');
                                                        }}
                                                        onMouse={
                                                            hasBrowser
                                                                ? () => {
                                                                      setModal('mouse');
                                                                  }
                                                                : undefined
                                                        }
                                                        onLock={() => {
                                                            lockSession();
                                                            void navigate('/unlock', { replace: true });
                                                        }}
                                                        onPhrase={() => {
                                                            setModal('phrase');
                                                        }}
                                                        onDelete={() => {
                                                            setModal('delete');
                                                        }}
                                                    />
                                                )}

                                                {item.key === 'Wallet' && (
                                                    <DashboardWallet
                                                        kind={vault.kind}
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
                                                        onBackup={() => {
                                                            setModal('phrase');
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
                            </Block>
                        ))}
                    </Track>
                </Block>
            </Horizontal>
        </Screen>
    );
}

export default function DashboardPage() {
    const vault = useVault();

    // The loader only guards the way in; a lock while open (idle deadline, another window) lands here.
    if (vault === undefined) {
        return <Navigate to='/' replace />;
    }

    return <DashboardView vault={vault} />;
}
