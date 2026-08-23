import type { IconType } from 'react-icons';

import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineGlobeAlt, HiOutlineSquares2X2, HiOutlineWallet } from 'react-icons/hi2';

import ScrollArea from '../layout/scroll';
import PageContainer from '../layout/container';
import DashboardApps from '../components/dashboard/dashboard.apps';
import DashboardNav from '../components/dashboard/dashboard.nav';
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
import { discoverTokens, hideToken, loadHiddenTokens, loadTokens, readToken, saveHiddenTokens, saveTokens, unhideToken, type HiddenMap, type TokenMap } from '../core/token';
import { discoveryDue, discoveryKey, markDiscovered } from '../core/token.cache';
import { defaultAccountName, loadAccounts, saveAccounts, saveActiveAccount, type Account } from '../utility/account';

/*
 * The dialogs, split out of the dashboard chunk.
 *
 * Every one of these renders only after a deliberate tap, and several drag real weight behind them —
 * `receive` pulls in the QR encoder, `phrase` the PNG writer and the filesystem plugin, `send` the
 * whole transfer flow. Statically imported they were parsed on the way to the wallet screen, only to
 * sit unrendered until someone opened them.
 *
 * The browser is here for a different reason: Swiper mounts all three tab panels at once, so the
 * in-app browser was being built during the dashboard's first render even though the wallet tab is
 * what is on screen. It loads with its tab now.
 *
 * The naming rule is suspended for this block alone. It requires components to be PascalCase and
 * everything variable-like to be camelCase, which everywhere else lines up — components in this
 * codebase are `function` declarations. `lazy()` returns a value, so a lazily-loaded component is the
 * one kind that cannot be declared as a function, and calling them `dashboardSend` would make them
 * the only components in the app that read as plain variables at their call sites.
 */
/* eslint-disable @typescript-eslint/naming-convention */
const DashboardSend = lazy(async() => import('../components/dashboard/dashboard.send'));
const DashboardTokens = lazy(async() => import('../components/dashboard/dashboard.tokens'));
const IntroLanguage = lazy(async() => import('../components/intro/intro.language'));
const DashboardLogout = lazy(async() => import('../components/dashboard/dashboard.logout'));
const DashboardAccount = lazy(async() => import('../components/dashboard/dashboard.account'));
const DashboardNetwork = lazy(async() => import('../components/dashboard/dashboard.network'));
const DashboardReceive = lazy(async() => import('../components/dashboard/dashboard.receive'));
const DashboardRedeem = lazy(async() => import('../components/dashboard/dashboard.redeem'));
const DashboardBrowser = lazy(async() => import('../components/dashboard/dashboard.browser'));
const DashboardRequest = lazy(async() => import('../components/dashboard/dashboard.request'));
const DashboardHistory = lazy(async() => import('../components/dashboard/dashboard.history'));
const DashboardPhrase = lazy(async() => import('../components/dashboard/dashboard.phrase'));
const DashboardSettings = lazy(async() => import('../components/dashboard/dashboard.settings'));
/* eslint-enable @typescript-eslint/naming-convention */

type Modal = 'none' | 'send' | 'receive' | 'network' | 'language' | 'logout' | 'settings' | 'accounts' | 'tokens' | 'history' | 'phrase' | 'redeem';

const navMap: { key: string; icon: IconType }[] =
[
    { key: 'Wallet', icon: HiOutlineWallet },
    { key: 'Browser', icon: HiOutlineGlobeAlt },
    { key: 'Apps', icon: HiOutlineSquares2X2 }
];

/**
 * DashboardView - The unlocked wallet home.
 *
 * Owns the active account (a derivation index on the one vault), the account list, the active network, and the live balances, then feeds them to the three tabs and the transfer modals so every surface reads the same state.
 *
 * The vault is either a mnemonic or a single imported private key. Only two things here care which: the account list, which cannot grow past one on a key, and the labels on the surfaces that name the secret.
 *
 * Takes the vault as a prop rather than reading the session itself. That is what lets the type be
 * `Vault` and not `Vault | undefined` — the locked case is answered once, by the wrapper below, before
 * any of this component's hooks run.
 * @param {object} props Component props.
 * @param {Vault} props.vault The unlocked key material.
 * @returns {JSX.Element} The dashboard page.
 */
function DashboardView({ vault }: { vault: Vault })
{
    const navigate = useNavigate();

    const [ active, setActive ] = useState(0);
    const [ account, setAccount ] = useState(0);
    const [ navHidden, setNavHidden ] = useState(false);
    const [ modal, setModal ] = useState<Modal>('none');
    const [ link, setLink ] = useState({ url: '', ticket: 0 });
    const [ network, setNetworkState ] = useState(getNetwork());
    const [ tokenMap, setTokenMap ] = useState<TokenMap>({});
    const [ loaded, setLoaded ] = useState(false);
    const [ scan, setScan ] = useState(0);

    // What `scan` was when the sweep last ran, so a manual refresh is told apart from a re-render.
    const lastScan = useRef(0);

    const [ hidden, setHidden ] = useState<HiddenMap>({});

    // The discovery pass below reads the tracked list without being re-run by it: adding what it finds
    // changes `tokenMap`, and a dependency on that would send it straight round again. The dismissed
    // list is read the same way and for the same reason — removing a token must not itself start a sweep.
    const tokenRef = useRef(tokenMap);
    const hiddenRef = useRef(hidden);
    const [ accounts, setAccounts ] = useState<Account[]>([ { index: 0, name: defaultAccountName(0) } ]);

    // A private-key wallet ignores the index and always answers with its one address.
    const address = useMemo(() => vaultAddress(vault, account), [ vault, account ]);

    const derivable = vaultDerivable(vault);

    /**
     * goTab - Moves to a tab and brings the nav bar back with it.
     *
     * Swiper's `onSlideChange` used to do the second half. Every caller that moved a tab went through
     * `slideTo` and got the bar restored as a side effect of the animation reporting itself; with the
     * track being plain CSS there is no event to hang that on, so the two facts are stated together.
     * @param {number} index Which tab to show.
     * @returns {void}
     */
    const goTab = useCallback((index: number) =>
    {
        setActive(index);
        setNavHidden(false);
    }, [ ]);

    // Every dialog closes the same way and three of them step back to settings rather than to the
    // dashboard, so the two destinations are named once instead of being written out at each mount.
    const closeModal = useCallback(() => { setModal('none'); }, [ ]);
    const backToSettings = useCallback(() => { setModal('settings'); }, [ ]);

    const current = accounts.find((item) => item.index === account);

    const name = current?.name ?? defaultAccountName(account);
    const emoji = current?.emoji ?? '';

    const tracked = useMemo(() => tokenMap[network.chainId] ?? [], [ tokenMap, network.chainId ]);

    // The browser tab is a full-bleed surface with its own way out, so the nav bar stays down for as
    // long as the user is in it rather than fighting the page for the bottom of the screen.
    const barHidden = navHidden || navMap[active].key === 'Browser';

    const online = useOnline();

    // The dApp request waiting on the user, if any. It is read here rather than inside the browser tab
    // because the sheet has to be mounted beside the wallet's other dialogs — a page in the browser is
    // painted by an OS-level view laid over the app, so nothing rendered inside that tab can appear
    // above it, and hiding that view is what puts the sheet on screen.
    const prompt = useDappPrompt();

    const native = useBalance(address, network);
    const tokens = useTokens(address, network, tracked);
    const prices = usePrices(network, native.formatted, tokens.tokens);
    const history = useHistory(address, network, tracked);

    /*
     * What the wallet tab's staleness strip speaks for.
     *
     * `useTokens` reports `error` and `at` exactly as `useBalance` does, and nothing read them — so a
     * chain that answered for the native balance and refused for every ERC20 showed a tab that looked
     * entirely current, with the token rows simply absent. The strip covers every figure above it, so
     * it has to see both reads: it fails if either failed, and it dates the figures by the older of
     * the two that actually landed.
     */
    const reads = useMemo(() =>
    {
        const stamps = [ native.at, tokens.at ].filter((value) => value > 0);

        return {
            formatted: native.formatted,
            loading: native.loading,
            error: native.error || tokens.error,
            at: stamps.length > 0 ? Math.min(...stamps) : 0
        };
    }, [ native.formatted, native.loading, native.error, native.at, tokens.error, tokens.at ]);

    useEffect(() =>
    {
        const run = async() =>
        {
            // Three independent stores, so one round-trip instead of three: the accounts, the tracked
            // tokens and the dismissed ones have nothing to say to each other, and this runs on the
            // way to the first paint of the wallet screen.
            const [ stored, storedTokens, dismissed ] = await Promise.all([ loadAccounts(), loadTokens(), loadHiddenTokens() ]);

            // A key holds one account and no index derives a second, so the stored list is pinned to
            // slot 0 — a list left behind by a mnemonic wallet on this device would otherwise offer
            // accounts this vault has no way to sign for. The label and badge on slot 0 are kept.
            const single = stored.accounts.find((item) => item.index === 0) ?? { index: 0, name: defaultAccountName(0) };

            setAccounts(derivable ? stored.accounts : [ single ]);
            setAccount(derivable ? stored.active : 0);

            setTokenMap(storedTokens);
            setHidden(dismissed);
            setLoaded(true);
        };

        void run();
    }, []);

    useEffect(() =>
    {
        tokenRef.current = tokenMap;
    }, [ tokenMap ]);

    useEffect(() =>
    {
        hiddenRef.current = hidden;
    }, [ hidden ]);

    /**
     * Adds the tokens this account actually holds, so a balance shows up without being asked for.
     *
     * Held back until the stored list has been read: discovering a token first would have it written
     * and then overwritten by the load landing behind it. What is found is merged rather than
     * assigned, so a token added by hand in the meantime is not dropped.
     */
    useEffect(() =>
    {
        if (!loaded)
        {
            return undefined;
        }

        let live = true;

        // The sweep is the most expensive thing this page does — an explorer call, then a `balanceOf`
        // against every contract it names — and it ran again on every return to a chain, including one
        // swept seconds earlier. Held off inside its window unless the user asked, which is what the
        // `scan` bump behind pull-to-refresh means.
        const sweepKey = discoveryKey(address, network.chainId);
        const forced = scan !== lastScan.current;

        lastScan.current = scan;

        // A sweep with no link finds nothing — and would then record itself as done, locking discovery
        // out for the whole window over a moment with no wifi. Skipped outright instead, and the effect
        // runs again on its own when the link returns.
        if (!online || (!forced && !discoveryDue(sweepKey)))
        {
            return undefined;
        }

        const run = async() =>
        {
            // `discoverTokens` swallows its own explorer failures, but the on-chain verification it
            // ends with rejects when not one contract could be read — the chain being away rather than
            // the account holding nothing.
            const found = await discoverTokens(address, network, tokenRef.current[network.chainId] ?? [], hiddenRef.current[network.chainId] ?? []).catch(() => undefined);

            // A failed sweep is not a completed one. Marking it would lock discovery out for the whole
            // window on the strength of a request that never landed.
            if (found === undefined)
            {
                return;
            }

            markDiscovered(sweepKey);

            if (!live || found.length === 0)
            {
                return;
            }

            const held = tokenRef.current;
            const list = held[network.chainId] ?? [];
            const fresh = found.filter((item) => !list.some((entry) => entry.address.toLowerCase() === item.address.toLowerCase()));

            if (fresh.length === 0)
            {
                return;
            }

            const next = { ...held, [network.chainId]: [ ...list, ...fresh ] };

            setTokenMap(next);

            await saveTokens(next);
        };

        void run();

        return () =>
        {
            live = false;
        };
    }, [ loaded, address, network.chainId, scan, online ]);

    /**
     * onAddToken - Resolves a pasted contract address into a tracked token.
     *
     * The metadata is read off the contract rather than typed by the user, so an address that is not a readable ERC20 on this network is rejected here instead of showing up as an empty row.
     * @param {string} contract The contract address the user entered.
     * @returns {Promise<string>} A localized error message, or an empty string when the token was added.
     */
    const onAddToken = async(contract: string) =>
    {
        if (tracked.some((item) => item.address.toLowerCase() === contract.toLowerCase()))
        {
            return T('Dashboard.Tokens.Exists');
        }

        try
        {
            const token = await readToken(network.chainId, contract);

            if (tracked.some((item) => item.address === token.address))
            {
                return T('Dashboard.Tokens.Exists');
            }

            const next = { ...tokenMap, [network.chainId]: [ ...tracked, token ] };

            setTokenMap(next);

            await saveTokens(next);

            // Adding it by hand is the user asking for it back, which is the one thing that clears an
            // earlier removal — otherwise the next sweep would still be suppressing what they just added.
            const cleared = unhideToken(hidden, network.chainId, token.address);

            if (cleared !== hidden)
            {
                setHidden(cleared);

                await saveHiddenTokens(cleared);
            }

            return '';
        }
        catch
        {
            return T('Dashboard.Tokens.NotFound');
        }
    };

    /**
     * onRemoveToken - Drops a token from the list and remembers that it was dropped.
     *
     * The removal has to be recorded, not just performed: discovery adds held contracts nobody is
     * tracking, so a token deleted from the list is exactly what the next sweep would find and restore.
     * @param {string} contract The contract address being removed.
     * @returns {void}
     */
    const onRemoveToken = (contract: string) =>
    {
        const next = { ...tokenMap, [network.chainId]: tracked.filter((item) => item.address !== contract) };

        setTokenMap(next);

        void saveTokens(next);

        const marked = hideToken(hidden, network.chainId, contract);

        if (marked !== hidden)
        {
            setHidden(marked);

            void saveHiddenTokens(marked);
        }
    };

    // The provider, connected for as long as the dashboard is. It is started here rather than inside
    // the browser tab because a page keeps its view — and so its provider — alive while the user is on
    // another tab, and a bridge torn down with the browser component would leave those pages talking
    // to nothing. Locking the wallet unmounts the dashboard, which is where the pending dialogs are
    // refused: a page waiting on a prompt whose window has gone would otherwise wait for good.
    useEffect(() =>
    {
        void loadConnections();

        const stop = startDappBridge(answerDapp);

        return () =>
        {
            stop();

            rejectDappPrompts();

            // The account is cleared as well as the listeners. Locking unmounts this, and while
            // nothing could reach the provider afterwards anyway, leaving the address behind in a
            // module that outlives the session means a locked wallet is still holding the answer to
            // "which account is this" — and the browser views it described are gone with the tab.
            setDappAccount('', 0);

            forgetDappPages();
        };
    }, []);

    // Whatever the wallet is currently showing, told to the provider and then to the pages. Both calls
    // are cheap and idempotent: the second compares against what each page was last told and stays
    // quiet when nothing moved, which is most renders.
    useEffect(() =>
    {
        setDappAccount(address, account);

        syncDappState();
    }, [ address, account, network.chainId ]);

    // A site can move the wallet as well as read it — `wallet_switchEthereumChain` and
    // `wallet_addEthereumChain` both do — and the network is state held here, so the change has to
    // come back into React or the header would go on naming the chain the wallet was on before.
    useEffect(() => subscribeDappChange(() => { setNetworkState(getNetwork()); }), []);

    // `wallet_watchAsset` ends up in the same list the token dialog writes to, so it goes through the
    // same function: the name and decimals are read off the contract rather than taken from the site,
    // and a token already tracked counts as a success because the site asked for a state that holds.
    useEffect(() =>
    {
        setDappWatchAsset(async(contract: string) =>
        {
            if (tracked.some((item) => item.address.toLowerCase() === contract.toLowerCase()))
            {
                return true;
            }

            return (await onAddToken(contract)).length === 0;
        });
    }, [ tracked, tokenMap, hidden, network.chainId ]);

    /**
     * onRefresh - Re-reads every live source behind the tabs.
     *
     * Prices are derived from the balances rather than fetched independently, so refreshing the
     * balances is what pulls them along; only these three have anything to re-request.
     * @returns {Promise<void>} Resolves once the slowest refetch settles, so the pull indicator stays
     * up for as long as work is actually happening.
     */
    const onRefresh = async() =>
    {
        native.refresh();
        tokens.refresh();
        history.refresh();

        // A token that arrived since the last look is found by the same pull that refreshes the rest.
        setScan((value) => value + 1);

        // No pause. There used to be a flat 600ms here so the pull indicator read as work, which made
        // the gesture lie in both directions — padded when the network was fast, cut short when it was
        // slow. The three hooks each own an in-flight flag, so the indicator can follow the real one.
        await Promise.resolve();
    };

    const onSelectAccount = (index: number) =>
    {
        if (!accounts.some((item) => item.index === index))
        {
            const next = [ ...accounts, { index, name: defaultAccountName(index) } ].sort((left, right) => left.index - right.index);

            setAccounts(next);

            void saveAccounts(next);
        }

        setAccount(index);

        void saveActiveAccount(index);
    };

    /**
     * onUpdateAccount - Changes one account's label or badge.
     *
     * A patch rather than a value, because the switcher edits two independent things and neither
     * should have to restate the other. An index that is not in the list yet is added with the
     * default label, which is what happens when a badge is set on a freshly derived account.
     * @param {number} index The derivation index being changed.
     * @param {Partial<Account>} patch The fields to change.
     * @returns {void}
     */
    const onUpdateAccount = (index: number, patch: Partial<Account>) =>
    {
        const next = accounts.some((item) => item.index === index) ?
            accounts.map((item) => (item.index === index ? { ...item, ...patch } : item)) :
            [ ...accounts, { index, name: defaultAccountName(index), ...patch } ].sort((left, right) => left.index - right.index);

        setAccounts(next);

        void saveAccounts(next);
    };

    /**
     * onPanelScroll - Drives the navigation bar from the active panel's scroll offset.
     *
     * Scrolling down tucks the bar away so it stops covering the content, scrolling back up (or reaching the top) brings it in. Only the panel the user is looking at may move it.
     *
     * The bottom of a panel is padded by exactly the height of the bar, so once the user reaches the end there is nothing left for it to cover — it comes back regardless of the scroll direction that got them there.
     * @param {number} index The panel that emitted the event.
     * @returns {(top: number, delta: number, bottom: number) => void} The scroll handler for that panel.
     */
    const onPanelScroll = (index: number) => (top: number, delta: number, bottom: number) =>
    {
        if (index !== active)
        {
            return;
        }

        if (top <= 24 || bottom <= 24)
        {
            setNavHidden(false);

            return;
        }

        if (delta > 6)
        {
            setNavHidden(true);
        }
        else if (delta < -6)
        {
            setNavHidden(false);
        }
    };

    /**
     * onBrowse - Hands an address to the in-app browser and goes there.
     *
     * The page opens on the browser tab rather than over the tab that asked for it, so the user lands in something they can navigate — back, reload, address bar — instead of a dead-end panel. `ticket` makes each request distinct, so asking for the same address twice still reopens it.
     *
     * Any dialog that was up closes on the way, since the destination is a different tab: a transaction
     * opened from the history overview must not leave that sheet covering the page it asked for.
     * @param {string} url The address to open.
     * @returns {void}
     */
    const onBrowse = (url: string) =>
    {
        setLink((value) => ({ url, ticket: value.ticket + 1 }));

        setModal('none');

        goTab(navMap.findIndex((item) => item.key === 'Browser'));
    };

    /**
     * onTransaction - Hands one transaction's explorer page to the in-app browser.
     *
     * A chain that declares no explorer has no page to open, and the row that would have called this is
     * not offered in the first place — this is the second guard on the same fact.
     * @param {string} hash The transaction hash.
     * @returns {void}
     */
    const onTransaction = (hash: string) =>
    {
        if (network.explorerUrl.length === 0)
        {
            return;
        }

        onBrowse(`${ network.explorerUrl.replace(/\/+$/u, '') }/tx/${ hash }`);
    };

    const onNetworkChange = () =>
    {
        setNetworkState(getNetwork());
    };

    const onSent = () =>
    {
        native.refresh();
        tokens.refresh();
    };

    return (
        <motion.div
            initial={ { opacity: 0 } }
            animate={ { opacity: 1 } }
            transition={ { type: 'tween' } }
            className='relative size-full bg-base-1'>

            { /*
              * One boundary for every dialog rather than one each: only ever a single dialog is open,
              * and `null` while its chunk arrives is the honest thing to show — the panel animates in
              * when it lands, instead of a spinner appearing where the panel is about to be.
              */ }
            <Suspense fallback={ null }>

                <AnimatePresence>

                    {
                        modal === 'send' &&
                        (
                            <DashboardSend
                                key='send'
                                vault={ vault }
                                index={ account }
                                network={ network }
                                nativeValue={ native.value }
                                nativeFormatted={ native.formatted }
                                tokens={ tokens.tokens }
                                onSent={ onSent }
                                onClose={ closeModal } />
                        )
                    }

                    {
                        modal === 'receive' &&
                        (
                            <DashboardReceive
                                key='receive'
                                address={ address }
                                network={ network }
                                onClose={ closeModal } />
                        )
                    }

                    {
                        modal === 'accounts' &&
                        (
                            <DashboardAccount
                                key='accounts'
                                vault={ vault }
                                accounts={ accounts }
                                active={ account }
                                onSelect={ onSelectAccount }
                                onUpdate={ onUpdateAccount }
                                onClose={ closeModal } />
                        )
                    }

                    {
                        modal === 'tokens' &&
                        (
                            <DashboardTokens
                                key='tokens'
                                network={ network }
                                tokens={ tokens.tokens }
                                prices={ prices.prices }
                                onAdd={ onAddToken }
                                onRemove={ onRemoveToken }
                                onClose={ closeModal } />
                        )
                    }

                    {
                        modal === 'history' &&
                        (
                            <DashboardHistory
                                key='history'
                                items={ history.items }
                                loading={ history.loading }
                                notice={ history.notice }
                                canOpen={ network.explorerUrl.length > 0 }
                                onOpen={ onTransaction }
                                onClose={ closeModal } />
                        )
                    }

                    {
                        modal === 'network' &&
                        (
                            <DashboardNetwork
                                key='network'
                                network={ network }
                                onChange={ onNetworkChange }
                                onClose={ closeModal } />
                        )
                    }

                    {
                        modal === 'language' &&
                        (
                            <IntroLanguage
                                key='language'
                                onClose={ backToSettings } />
                        )
                    }

                    {
                        modal === 'redeem' &&
                        (
                            <DashboardRedeem
                                key='redeem'
                                address={ address }
                                onClose={ closeModal } />
                        )
                    }

                    {
                        modal === 'phrase' &&
                        (
                            <DashboardPhrase
                                key='phrase'
                                kind={ vault.kind }
                                onClose={ backToSettings } />
                        )
                    }

                    {
                        modal === 'logout' &&
                        (
                            <DashboardLogout
                                key='logout'
                                kind={ vault.kind }
                                onClose={ backToSettings } />
                        )
                    }

                    {
                        modal === 'settings' &&
                        (
                            <DashboardSettings
                                key='settings'
                                kind={ vault.kind }
                                onLanguage={ () => { setModal('language'); } }
                                onLock={ () => { lockSession(); void navigate('/unlock', { replace: true }); } }
                                onPhrase={ () => { setModal('phrase'); } }
                                onLogout={ () => { setModal('logout'); } }
                                onClose={ closeModal } />
                        )
                    }

                    { /*
                      * The dApp approval sheet, mounted with the dialogs and outside the `modal`
                      * state on purpose: it is not something the user opened, so it cannot be one of
                      * the values that variable holds, and it has to be able to appear over whatever
                      * they were already doing. Keyed by the prompt so that a second request queued
                      * behind the first animates in as a new sheet rather than silently swapping its
                      * contents under the user's finger — which, on a signing dialog, is the one
                      * transition that must never happen.
                      */ }
                    {
                        prompt !== undefined &&
                        (
                            <DashboardRequest
                                key={ prompt.id }
                                prompt={ prompt }
                                address={ address }
                                network={ network.name } />
                        )
                    }

                </AnimatePresence>

            </Suspense>

            { /*
              * A plain transform track, not a carousel.
              *
              * This was a Swiper with `allowTouchMove={ false }` — every gesture disabled, the nav
              * bar's `slideTo` the only way to move — which is to say it was a library computing a
              * `translateX` that one line of CSS computes. It was also 78 KB against a 44 KB route,
              * and it is lazily loaded nowhere: it sat in the dashboard chunk. Dropping it here takes
              * the whole library off the tab the app opens on.
              *
              * The track is laid out in the writing direction, so the panels sit in the same order
              * the nav bar shows them in and the slide moves the way the eye expects. That is the
              * only reason the sign flips: in `rtl` the later panels are to the left, so reaching
              * them means translating right.
              *
              * Nothing is keyed on the language any more either. The old key rebuilt this subtree on
              * every language change, and rebuilding it tears down every `WebFrame` — so switching
              * from English to French closed every open browser tab, with its scroll position, its
              * form input and its dApp session.
              */ }
            <div dir={ getDirection() } className='size-full overflow-hidden'>

                <div
                    className='flex size-full transition-transform duration-(--duration-surface) ease-out'
                    style={ { transform: `translateX(${ getDirection() === 'rtl' ? active * 100 : active * -100 }%)` } }>

                    {
                        navMap.map((item, index) => (
                            <div key={ item.key } className='size-full shrink-0'>

                                {
                                // The browser owns its whole slide: no padding, no scroll container, and
                                // no room reserved for the nav bar, since the bar is hidden while this tab
                                // is up. Only the drag region at the top of a frameless window is spared.
                                    item.key === 'Browser' ?
                                        (
                                            <PageContainer
                                                variant='browser'
                                                role='tabpanel'
                                                id={ `dashboard-panel-${ item.key }` }
                                                aria-hidden={ index === active ? undefined : true }
                                                inert={ index === active ? undefined : true }
                                                aria-labelledby={ `dashboard-tab-${ item.key }` }>

                                                { /*
                                              * `inert` is what makes the `aria-hidden` above honest.
                                              * Swiper mounts all three panels, so the two off screen kept
                                              * every button tabbable inside a subtree the accessibility
                                              * tree had been told did not exist — Tab walked into the
                                              * browser while the wallet was the tab on screen. It implies
                                              * `aria-hidden` on its own, but both are kept: the attribute
                                              * states the contract and this enforces it.
                                              */ }

                                                { /*
                                              * Its own boundary, because Swiper mounts every panel at
                                              * once: sharing the dialog boundary above would let the
                                              * browser's chunk suspend the dialogs too.
                                              */ }
                                                <Suspense fallback={ null }>

                                                    <DashboardBrowser
                                                        address={ address }
                                                        network={ network }
                                                        request={ link.url }
                                                        ticket={ link.ticket }
                                                        enabled={ index === active && modal === 'none' && prompt === undefined }
                                                        onExit={ () => { goTab(0); } } />

                                                </Suspense>

                                            </PageContainer>
                                        ) :
                                        (
                                            <ScrollArea
                                                className='size-full'
                                                onRefresh={ onRefresh }
                                                onScrollChange={ onPanelScroll(index) }>

                                                <PageContainer
                                                    variant='tab'
                                                    role='tabpanel'
                                                    id={ `dashboard-panel-${ item.key }` }
                                                    aria-hidden={ index === active ? undefined : true }
                                                    aria-labelledby={ `dashboard-tab-${ item.key }` }>

                                                    {
                                                        item.key === 'Wallet' &&
                                                        (
                                                            <DashboardWallet
                                                                address={ address }
                                                                name={ name }
                                                                emoji={ emoji }
                                                                network={ network }
                                                                native={ reads }
                                                                tokens={ tokens.tokens }
                                                                total={ prices.total }
                                                                totalLoading={ prices.loading }
                                                                totalAt={ prices.at }
                                                                prices={ prices.prices }
                                                                history={ history }
                                                                onSend={ () => { setModal('send'); } }
                                                                onReceive={ () => { setModal('receive'); } }
                                                                onRedeem={ () => { setModal('redeem'); } }
                                                                onNetwork={ () => { setModal('network'); } }
                                                                onAccounts={ () => { setModal('accounts'); } }
                                                                onTokens={ () => { setModal('tokens'); } }
                                                                onSettings={ () => { setModal('settings'); } }
                                                                onTransaction={ onTransaction }
                                                                onOverview={ () => { setModal('history'); } } />
                                                        )
                                                    }

                                                    {
                                                        item.key === 'Apps' && <DashboardApps active={ index === active } onOpen={ onBrowse } />
                                                    }

                                                </PageContainer>

                                            </ScrollArea>
                                        )
                                }

                            </div>
                        ))
                    }

                </div>

            </div>

            <DashboardNav
                items={ navMap }
                active={ active }
                hidden={ barHidden }
                onSelect={ goTab } />

        </motion.div>
    );
}

/**
 * DashboardPage - The dashboard route.
 *
 * The vault reaches this screen through the session rather than through the navigation, because route
 * state is written to `history.state` and a decrypted mnemonic must not be. The route's loader already
 * redirects when there is none, so this only covers the window between locking and the redirect
 * landing — a frame at most, and the fallback rather than a crash.
 *
 * Splitting the route from the view is also what keeps the view's vault non-optional: the check
 * happens here, before any of its hooks exist, instead of as an early return in the middle of thirty.
 * @returns {JSX.Element} The dashboard, or the loading state while the guard redirects.
 */
export default function DashboardPage()
{
    const vault = useVault();

    if (vault === undefined)
    {
        return <RouteFallback />;
    }

    return <DashboardView vault={ vault } />;
}
