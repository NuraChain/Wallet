import type { IconType } from 'react-icons';
import type { Swiper as SwiperType } from 'swiper';

import { Swiper, SwiperSlide } from 'swiper/react';
import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineGlobeAlt, HiOutlineSquares2X2, HiOutlineWallet } from 'react-icons/hi2';

import UnlockPage from './unlock';

import WalletManager from '../core/wallet';

import ScrollArea from '../layout/scroll';
import PageContainer from '../layout/container';
import DashboardApps from '../components/dashboard/dashboard.apps';
import DashboardNav from '../components/dashboard/dashboard.nav';
import DashboardSend from '../components/dashboard/dashboard.send';
import DashboardTokens from '../components/dashboard/dashboard.tokens';
import DashboardWallet from '../components/dashboard/dashboard.wallet';
import IntroLanguage from '../components/intro/intro.language';
import DashboardLogout from '../components/dashboard/dashboard.logout';
import DashboardAccount from '../components/dashboard/dashboard.account';
import DashboardNetwork from '../components/dashboard/dashboard.network';
import DashboardReceive from '../components/dashboard/dashboard.receive';
import DashboardRedeem from '../components/dashboard/dashboard.redeem';
import DashboardBrowser from '../components/dashboard/dashboard.browser';
import DashboardHistory from '../components/dashboard/dashboard.history';
import DashboardPhrase from '../components/dashboard/dashboard.phrase';
import DashboardSettings from '../components/dashboard/dashboard.settings';

import { getNetwork } from '../core/network';
import { openPage } from '../utility/context';
import { usePrices } from '../hook/price';
import { useHistory } from '../hook/history';
import { useBalance, useTokens } from '../hook/balance';
import { getDirection, getLanguage, T } from '../utility/language';
import { loadTokens, readToken, saveTokens, type TokenMap } from '../core/token';
import { defaultAccountName, loadAccounts, saveAccounts, saveActiveAccount, type Account } from '../utility/account';

import 'swiper/css';

type Modal = 'none' | 'send' | 'receive' | 'network' | 'language' | 'logout' | 'settings' | 'accounts' | 'tokens' | 'history' | 'phrase' | 'redeem';

const navMap: { key: string; icon: IconType }[] =
[
    { key: 'Wallet', icon: HiOutlineWallet },
    { key: 'Browser', icon: HiOutlineGlobeAlt },
    { key: 'Apps', icon: HiOutlineSquares2X2 }
];

/**
 * DashboardPage - The unlocked wallet home.
 *
 * Owns the active account (a derivation index on the one mnemonic), the account list, the active network, and the live balances, then feeds them to the three tabs and the transfer modals so every surface reads the same state.
 * @param {object} props Component props.
 * @param {string} props.mnemonic The unlocked mnemonic.
 * @returns {JSX.Element} The dashboard page.
 */
export default function DashboardPage({ mnemonic }: { mnemonic: string })
{
    const swiperRef = useRef<SwiperType>(undefined);

    const [ active, setActive ] = useState(0);
    const [ account, setAccount ] = useState(0);
    const [ navHidden, setNavHidden ] = useState(false);
    const [ modal, setModal ] = useState<Modal>('none');
    const [ link, setLink ] = useState({ url: '', ticket: 0 });
    const [ network, setNetworkState ] = useState(getNetwork());
    const [ tokenMap, setTokenMap ] = useState<TokenMap>({});
    const [ accounts, setAccounts ] = useState<Account[]>([ { index: 0, name: defaultAccountName(0) } ]);

    const address = useMemo(() => new WalletManager(mnemonic, account).retrieve().Public, [ mnemonic, account ]);

    const name = accounts.find((item) => item.index === account)?.name ?? defaultAccountName(account);

    const tracked = useMemo(() => tokenMap[network.chainId] ?? [], [ tokenMap, network.chainId ]);

    // The browser tab is a full-bleed surface with its own way out, so the nav bar stays down for as
    // long as the user is in it rather than fighting the page for the bottom of the screen.
    const barHidden = navHidden || navMap[active].key === 'Browser';

    const native = useBalance(address, network);
    const tokens = useTokens(address, network, tracked);
    const prices = usePrices(network, native.formatted, tokens.tokens);
    const history = useHistory(address, network);

    useEffect(() =>
    {
        const run = async() =>
        {
            const stored = await loadAccounts();

            setAccounts(stored.accounts);
            setAccount(stored.active);

            setTokenMap(await loadTokens());
        };

        void run();
    }, []);

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

            return '';
        }
        catch
        {
            return T('Dashboard.Tokens.NotFound');
        }
    };

    const onRemoveToken = (contract: string) =>
    {
        const next = { ...tokenMap, [network.chainId]: tracked.filter((item) => item.address !== contract) };

        setTokenMap(next);

        void saveTokens(next);
    };

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

        // The hooks fire off their own requests; this is the shortest pause that still reads as work
        // rather than a flicker, since none of them expose a promise to await.
        await new Promise((resolve) => { setTimeout(resolve, 600); });
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

    const onRenameAccount = (index: number, value: string) =>
    {
        const next = accounts.some((item) => item.index === index) ?
            accounts.map((item) => (item.index === index ? { ...item, name: value } : item)) :
            [ ...accounts, { index, name: value } ].sort((left, right) => left.index - right.index);

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
     * onTransaction - Hands one transaction's explorer page to the in-app browser.
     *
     * The link opens on the browser tab rather than over the wallet, so the user lands in something they can navigate — back, reload, address bar — instead of a dead-end panel. `ticket` makes each request distinct, so tapping the same transaction twice still reopens it.
     * @param {string} hash The transaction hash.
     * @returns {void}
     */
    const onTransaction = (hash: string) =>
    {
        if (network.explorerUrl.length === 0)
        {
            return;
        }

        setLink((value) => ({ url: `${ network.explorerUrl.replace(/\/+$/u, '') }/tx/${ hash }`, ticket: value.ticket + 1 }));

        setModal('none');

        swiperRef.current?.slideTo(navMap.findIndex((item) => item.key === 'Browser'));
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

            <AnimatePresence>

                {
                    modal === 'send' &&
                    (
                        <DashboardSend
                            key='send'
                            mnemonic={ mnemonic }
                            index={ account }
                            network={ network }
                            nativeValue={ native.value }
                            nativeFormatted={ native.formatted }
                            tokens={ tokens.tokens }
                            onSent={ onSent }
                            onClose={ () => { setModal('none'); } } />
                    )
                }

                {
                    modal === 'receive' &&
                    (
                        <DashboardReceive
                            key='receive'
                            address={ address }
                            network={ network }
                            onClose={ () => { setModal('none'); } } />
                    )
                }

                {
                    modal === 'accounts' &&
                    (
                        <DashboardAccount
                            key='accounts'
                            mnemonic={ mnemonic }
                            accounts={ accounts }
                            active={ account }
                            onSelect={ onSelectAccount }
                            onRename={ onRenameAccount }
                            onClose={ () => { setModal('none'); } } />
                    )
                }

                {
                    modal === 'tokens' &&
                    (
                        <DashboardTokens
                            key='tokens'
                            network={ network }
                            tokens={ tokens.tokens }
                            onAdd={ onAddToken }
                            onRemove={ onRemoveToken }
                            onClose={ () => { setModal('none'); } } />
                    )
                }

                {
                    modal === 'history' &&
                    (
                        <DashboardHistory
                            key='history'
                            items={ history.items }
                            loading={ history.loading }
                            canOpen={ network.explorerUrl.length > 0 }
                            onOpen={ onTransaction }
                            onClose={ () => { setModal('none'); } } />
                    )
                }

                {
                    modal === 'network' &&
                    (
                        <DashboardNetwork
                            key='network'
                            network={ network }
                            onChange={ onNetworkChange }
                            onClose={ () => { setModal('none'); } } />
                    )
                }

                {
                    modal === 'language' &&
                    (
                        <IntroLanguage
                            key='language'
                            onClose={ () => { setModal('settings'); } } />
                    )
                }

                {
                    modal === 'redeem' &&
                    (
                        <DashboardRedeem
                            key='redeem'
                            address={ address }
                            onClose={ () => { setModal('none'); } } />
                    )
                }

                {
                    modal === 'phrase' &&
                    (
                        <DashboardPhrase
                            key='phrase'
                            onClose={ () => { setModal('settings'); } } />
                    )
                }

                {
                    modal === 'logout' &&
                    (
                        <DashboardLogout
                            key='logout'
                            onClose={ () => { setModal('settings'); } } />
                    )
                }

                {
                    modal === 'settings' &&
                    (
                        <DashboardSettings
                            key='settings'
                            onLanguage={ () => { setModal('language'); } }
                            onLock={ () => { openPage(UnlockPage); } }
                            onPhrase={ () => { setModal('phrase'); } }
                            onLogout={ () => { setModal('logout'); } }
                            onClose={ () => { setModal('none'); } } />
                    )
                }

            </AnimatePresence>

            <Swiper
                key={ getLanguage().code }
                dir={ getDirection() }
                speed={ 350 }
                // `simulateTouch` only governs mouse-drag emulation, so touch swipes still went
                // through on a phone. `allowTouchMove` is the one that covers both, leaving the nav
                // bar's `slideTo` as the only way to change tab.
                allowTouchMove={ false }
                initialSlide={ active }
                onSwiper={ (swiper) => { swiperRef.current = swiper; } }
                onSlideChange={ (swiper) => { setActive(swiper.activeIndex); setNavHidden(false); } }
                className='size-full'>

                {
                    navMap.map((item, index) => (
                        <SwiperSlide key={ item.key }>

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
                                            aria-hidden={ index !== active }
                                            aria-labelledby={ `dashboard-tab-${ item.key }` }>

                                            <DashboardBrowser
                                                address={ address }
                                                network={ network }
                                                request={ link.url }
                                                ticket={ link.ticket }
                                                enabled={ index === active && modal === 'none' }
                                                onExit={ () => { swiperRef.current?.slideTo(0); } } />

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
                                                aria-hidden={ index !== active }
                                                aria-labelledby={ `dashboard-tab-${ item.key }` }>

                                                {
                                                    item.key === 'Wallet' &&
                                                    (
                                                        <DashboardWallet
                                                            address={ address }
                                                            name={ name }
                                                            network={ network }
                                                            nativeFormatted={ native.formatted }
                                                            nativeLoading={ native.loading }
                                                            tokens={ tokens.tokens }
                                                            total={ prices.total }
                                                            totalLoading={ prices.loading }
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
                                                    item.key === 'Apps' && <DashboardApps />
                                                }

                                            </PageContainer>

                                        </ScrollArea>
                                    )
                            }

                        </SwiperSlide>
                    ))
                }

            </Swiper>

            <DashboardNav
                items={ navMap }
                active={ active }
                hidden={ barHidden }
                onSelect={ (index) => { swiperRef.current?.slideTo(index); } } />

        </motion.div>
    );
}
