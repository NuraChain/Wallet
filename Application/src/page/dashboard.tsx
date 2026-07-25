import type { IconType } from 'react-icons';
import type { Swiper as SwiperType } from 'swiper';

import { Swiper, SwiperSlide } from 'swiper/react';
import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineCog6Tooth, HiOutlineGlobeAlt, HiOutlineWallet } from 'react-icons/hi2';

import UnlockPage from './unlock';

import WalletManager from '../core/wallet';

import DashboardSend from '../components/dashboard.send';
import DashboardWallet from '../components/dashboard.wallet';
import IntroLanguage from '../components/intro.language';
import DashboardLogout from '../components/dashboard.logout';
import DashboardNetwork from '../components/dashboard.network';
import DashboardReceive from '../components/dashboard.receive';
import DashboardBrowser from '../components/dashboard.browser';
import DashboardSettings from '../components/dashboard.settings';

import { getNetwork } from '../core/network';
import { openPage } from '../utility/context';
import { getValue, setValue } from '../utility/storage';
import { useBalance, useTokens } from '../hook/balance';
import { getDirection, getLanguage, T } from '../utility/language';

import 'swiper/css';

type Modal = 'none' | 'send' | 'receive' | 'network' | 'language' | 'logout';

const navMap: { key: string; icon: IconType }[] =
[
    { key: 'Wallet', icon: HiOutlineWallet },
    { key: 'Browser', icon: HiOutlineGlobeAlt },
    { key: 'Settings', icon: HiOutlineCog6Tooth }
];

/**
 * DashboardPage - The unlocked wallet home.
 *
 * Owns the account address (derived once from the mnemonic), the account label, the active network, and the live balances, then feeds them to the three tabs and the transfer modals so every surface reads the same state.
 * @param {object} props Component props.
 * @param {string} props.mnemonic The unlocked mnemonic.
 * @returns {JSX.Element} The dashboard page.
 */
export default function DashboardPage({ mnemonic }: { mnemonic: string })
{
    const swiperRef = useRef<SwiperType>(undefined);

    const address = useMemo(() => new WalletManager(mnemonic, 0).retrieve().Public, [ mnemonic ]);

    const [ active, setActive ] = useState(0);
    const [ modal, setModal ] = useState<Modal>('none');
    const [ network, setNetworkState ] = useState(getNetwork());
    const [ name, setName ] = useState(`${ T('Dashboard.Account') } 1`);

    const native = useBalance(address, network);
    const tokens = useTokens(address, network);

    useEffect(() =>
    {
        const run = async() =>
        {
            const stored = await getValue('Wallet.Name');

            if (stored !== undefined && stored.length > 0)
            {
                setName(stored);
            }
        };

        void run();
    }, []);

    const onRename = (value: string) =>
    {
        setName(value);

        void setValue('Wallet.Name', value);
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
                            onClose={ () => { setModal('none'); } } />
                    )
                }

                {
                    modal === 'logout' &&
                    (
                        <DashboardLogout
                            key='logout'
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
                onSlideChange={ (swiper) => { setActive(swiper.activeIndex); } }
                className='size-full'>

                {
                    navMap.map((item, index) => (
                        <SwiperSlide key={ item.key }>

                            <div
                                role='tabpanel'
                                id={ `dashboard-panel-${ item.key }` }
                                aria-hidden={ index !== active }
                                aria-labelledby={ `dashboard-tab-${ item.key }` }
                                className='flex size-full flex-col overflow-y-auto p-4 pb-[calc(7rem+env(safe-area-inset-bottom))]'>

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
                                            tokensLoading={ tokens.loading }
                                            onSend={ () => { setModal('send'); } }
                                            onReceive={ () => { setModal('receive'); } }
                                            onNetwork={ () => { setModal('network'); } } />
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
                                    item.key === 'Settings' &&
                                    (
                                        <DashboardSettings
                                            name={ name }
                                            onRename={ onRename }
                                            onLanguage={ () => { setModal('language'); } }
                                            onLock={ () => { openPage(UnlockPage); } }
                                            onLogout={ () => { setModal('logout'); } } />
                                    )
                                }

                            </div>

                        </SwiperSlide>
                    ))
                }

            </Swiper>

            <div
                role='tablist'
                className='glass-panel absolute inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 mx-auto flex w-fit gap-1 rounded-full p-1'>

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

            </div>

        </motion.div>
    );
}
