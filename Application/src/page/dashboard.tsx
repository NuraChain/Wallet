import type { IconType } from 'react-icons';
import type { Swiper as SwiperType } from 'swiper';

import { motion } from 'motion/react';
import { useMemo, useRef, useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { HiOutlineArrowsRightLeft, HiOutlineCog6Tooth, HiOutlineLockClosed, HiOutlineSquare2Stack, HiOutlineWallet } from 'react-icons/hi2';

import UnlockPage from './unlock';

import WalletManager from '../core/wallet';

import { openPage } from '../utility/context';
import { getDirection, getLanguage, T } from '../utility/language';

import 'swiper/css';

const navMap: { key: string; icon: IconType } [ ] =
[
    { key: 'Wallet', icon: HiOutlineWallet },
    { key: 'Activity', icon: HiOutlineArrowsRightLeft },
    { key: 'Settings', icon: HiOutlineCog6Tooth }
];

export default function DashboardPage({ mnemonic }: { mnemonic: string })
{
    const [ active, setActive ] = useState(0);

    const swiperRef = useRef<SwiperType>(undefined);

    const renderBody = (key: string) =>
    {
        if (key === 'Wallet')
        {
            return (
                <>
                    <div className='text-tiny text-txt-muted'>

                        { T('Dashboard.Address') }

                    </div>

                    <div className='glass-panel rounded-xl p-3 font-mono text-tiny break-all text-txt-normal select-text!'>

                        address

                    </div>

                    <button
                        type='button'
                        className='btn-muted flex h-10 w-fit items-center gap-2 rounded-xl px-4 text-tiny'>

                        <HiOutlineSquare2Stack size={ 16 } />

                        { T('Dashboard.Copy') }

                    </button>

                </>
            );
        }

        if (key === 'Settings')
        {
            return (
                <>
                    <div className='text-tiny text-txt-muted'>

                        { T('Dashboard.Empty') }

                    </div>

                    <button
                        type='button'
                        onClick={ () => { openPage(UnlockPage); } }
                        className='btn-primary flex h-10 w-fit items-center gap-2 rounded-xl px-4 text-tiny'>

                        <HiOutlineLockClosed size={ 16 } />

                        { T('Dashboard.Lock') }

                    </button>
                </>
            );
        }

        return (
            <div className='text-tiny text-txt-muted'>

                { T('Dashboard.Empty') }

            </div>
        );
    };

    return (
        <motion.div
            initial={ { opacity: 0 } }
            animate={ { opacity: 1 } }
            transition={ { type: 'tween' } }
            className='relative size-full bg-base-1'>

            <Swiper
                speed={ 350 }
                className='size-full'
                dir={ getDirection() }
                simulateTouch={ false }
                initialSlide={ active }
                key={ getLanguage().code }
                onSwiper={ (swiper) => { swiperRef.current = swiper; } }
                onSlideChange={ (swiper) => { setActive(swiper.activeIndex); } }>

                {
                    navMap.map((item, index) => (
                        <SwiperSlide key={ item.key }>

                            <div
                                className='flex size-full flex-col gap-2 overflow-y-auto p-4'>

                                {
                                    renderBody(item.key)
                                }

                            </div>

                        </SwiperSlide>
                    ))
                }

            </Swiper>

            <div className='glass-panel absolute inset-x-0 bottom-4 z-20 mx-auto flex w-fit gap-1 rounded-full p-1'>

                {
                    navMap.map((item, index) =>
                    {
                        const isActive = index === active;

                        return (
                            <button
                                type='button'
                                key={ item.key }
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
