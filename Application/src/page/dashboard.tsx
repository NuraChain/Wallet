import type { IconType } from 'react-icons';
import type { Swiper as SwiperType } from 'swiper';

import { Swiper, SwiperSlide } from 'swiper/react';
import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineGlobeAlt, HiOutlineSquares2X2, HiOutlineWallet } from 'react-icons/hi2';

import UnlockPage from './unlock';

import WalletManager from '../core/wallet';

import ScrollArea from '../layout/scroll';
import DashboardApps from '../components/dashboard.apps';
import DashboardSend from '../components/dashboard.send';
import DashboardTokens from '../components/dashboard.tokens';
import DashboardWallet from '../components/dashboard.wallet';
import IntroLanguage from '../components/intro.language';
import DashboardLogout from '../components/dashboard.logout';
import DashboardAccount from '../components/dashboard.account';
import DashboardNetwork from '../components/dashboard.network';
import DashboardReceive from '../components/dashboard.receive';
import DashboardBrowser from '../components/dashboard.browser';
import DashboardSettings from '../components/dashboard.settings';

import { getNetwork } from '../core/network';
import { openPage } from '../utility/context';
import { usePrices } from '../hook/price';
import { useIsWindows } from '../hook/platform';
import { useBalance, useTokens } from '../hook/balance';
import { getDirection, getLanguage, T } from '../utility/language';
import { loadHiddenTokens, saveHiddenTokens, type HiddenTokens } from '../core/token';
import { defaultAccountName, loadAccounts, saveAccounts, saveActiveAccount, type Account } from '../utility/account';

import 'swiper/css';

type Modal = 'none' | 'send' | 'receive' | 'network' | 'language' | 'logout' | 'settings' | 'accounts' | 'tokens';

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
    const isWindows = useIsWindows();
    const swiperRef = useRef<SwiperType>(undefined);

    const [ active, setActive ] = useState(0);
    const [ account, setAccount ] = useState(0);
    const [ navHidden, setNavHidden ] = useState(false);
    const [ modal, setModal ] = useState<Modal>('none');
    const [ network, setNetworkState ] = useState(getNetwork());
    const [ hidden, setHidden ] = useState<HiddenTokens>({});
    const [ accounts, setAccounts ] = useState<Account[]>([ { index: 0, name: defaultAccountName(0) } ]);

    const address = useMemo(() => new WalletManager(mnemonic, account).retrieve().Public, [ mnemonic, account ]);

    const name = accounts.find((item) => item.index === account)?.name ?? defaultAccountName(account);

    const native = useBalance(address, network);
    const tokens = useTokens(address, network);
    const prices = usePrices(network, native.formatted, tokens.tokens);

    const hiddenHere = hidden[network.chainId] ?? [];
    const visibleTokens = tokens.tokens.filter((item) => !hiddenHere.includes(item.token.address));

    useEffect(() =>
    {
        const run = async() =>
        {
            const stored = await loadAccounts();

            setAccounts(stored.accounts);
            setAccount(stored.active);

            setHidden(await loadHiddenTokens());
        };

        void run();
    }, []);

    const onToggleToken = (contract: string) =>
    {
        const next = { ...hidden, [network.chainId]: hiddenHere.includes(contract) ? hiddenHere.filter((item) => item !== contract) : [ ...hiddenHere, contract ] };

        setHidden(next);

        void saveHiddenTokens(next);
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
     * @param {number} index The panel that emitted the event.
     * @returns {(top: number, delta: number) => void} The scroll handler for that panel.
     */
    const onPanelScroll = (index: number) => (top: number, delta: number) =>
    {
        if (index !== active)
        {
            return;
        }

        if (top <= 24)
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
                            hidden={ hiddenHere }
                            onToggle={ onToggleToken }
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
                            onLogout={ () => { setModal('logout'); } }
                            onClose={ () => { setModal('none'); } } />
                    )
                }

            </AnimatePresence>

            <Swiper
                key={ getLanguage().code }
                dir={ getDirection() }
                speed={ 350 }
                simulateTouch={ false }
                initialSlide={ active }
                onSwiper={ (swiper) => { swiperRef.current = swiper; } }
                onSlideChange={ (swiper) => { setActive(swiper.activeIndex); setNavHidden(false); } }
                className='size-full'>

                {
                    navMap.map((item, index) => (
                        <SwiperSlide key={ item.key }>

                            <ScrollArea
                                className='size-full'
                                onScrollChange={ onPanelScroll(index) }>

                                <div
                                    role='tabpanel'
                                    id={ `dashboard-panel-${ item.key }` }
                                    aria-hidden={ index !== active }
                                    aria-labelledby={ `dashboard-tab-${ item.key }` }
                                    className={ `flex min-h-full flex-col px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] ${ isWindows ? 'pt-8' : 'pt-4' }` }>

                                    {
                                        item.key === 'Wallet' &&
                                        (
                                            <DashboardWallet
                                                address={ address }
                                                name={ name }
                                                network={ network }
                                                nativeFormatted={ native.formatted }
                                                nativeLoading={ native.loading }
                                                tokens={ visibleTokens }
                                                tokensLoading={ tokens.loading }
                                                total={ prices.total }
                                                totalLoading={ prices.loading }
                                                onSend={ () => { setModal('send'); } }
                                                onReceive={ () => { setModal('receive'); } }
                                                onNetwork={ () => { setModal('network'); } }
                                                onAccounts={ () => { setModal('accounts'); } }
                                                onTokens={ () => { setModal('tokens'); } }
                                                onSettings={ () => { setModal('settings'); } } />
                                        )
                                    }

                                    {
                                        item.key === 'Browser' &&
                                        (
                                            <DashboardBrowser
                                                address={ address }
                                                network={ network }
                                                enabled={ index === active && modal === 'none' } />
                                        )
                                    }

                                    {
                                        item.key === 'Apps' && <DashboardApps />
                                    }

                                </div>

                            </ScrollArea>

                        </SwiperSlide>
                    ))
                }

            </Swiper>

            <motion.div
                role='tablist'
                animate={ { y: navHidden ? '150%' : '0%', opacity: navHidden ? 0 : 1 } }
                transition={ { type: 'tween', duration: 0.25 } }
                className={ `glass-panel absolute inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 mx-auto flex w-fit gap-1 rounded-full p-1 ${ navHidden ? 'pointer-events-none' : '' }` }>

                {
                    navMap.map((item, index) =>
                    {
                        const isActive = index === active;

                        return (
                            <button
                                type='button'
                                role='tab'
                                key={ item.key }
                                id={ `dashboard-tab-${ item.key }` }
                                aria-selected={ isActive }
                                aria-controls={ `dashboard-panel-${ item.key }` }
                                onClick={ () => { swiperRef.current?.slideTo(index); } }
                                className={ `group relative flex h-12 w-20 cursor-pointer items-center justify-center rounded-full duration-300 ${ isActive ? '' : 'hover:bg-btn-muted-hover' }` }>

                                {
                                    isActive &&
                                    (
                                        <motion.div
                                            layoutId='dashboard-nav-active'
                                            transition={ { type: 'spring', stiffness: 420, damping: 35 } }
                                            className='absolute inset-0 rounded-full bg-btn-primary-active' />
                                    )
                                }

                                <div className={ `relative flex flex-col items-center gap-1 duration-300 ${ isActive ? 'text-txt-reverse' : 'text-txt-muted group-hover:text-txt-normal' }` }>

                                    <item.icon size={ 16 } />

                                    <div className='text-tiny'>

                                        { T(`Dashboard.Nav.${ item.key }`) }

                                    </div>

                                </div>

                            </button>
                        );
                    })
                }

            </motion.div>

        </motion.div>
    );
}
