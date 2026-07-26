import type { Swiper as SwiperType } from 'swiper';

import { LuImport } from 'react-icons/lu';
import { FaPlusCircle } from 'react-icons/fa';
import { useIsWindows } from '../hook/platform';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import { motion, AnimatePresence } from 'motion/react';
import { FiGlobe, FiMoon, FiSun } from 'react-icons/fi';
import { IoIosArrowDown, IoIosArrowForward } from 'react-icons/io';
import { useRef, useCallback, useState, type ReactNode } from 'react';

import IntroImport from '../components/intro.import';
import IntroWallet from '../components/intro.wallet';
import IntroLanguage from '../components/intro.language';

import { getDirection, getLanguage, T } from '../utility/language';
import { getTheme, setTheme } from '../utility/theme';

import IntroConnect from '../assets/image/intro_connect.png';
import IntroDecentralized from '../assets/image/intro_decentralized.png';

import 'swiper/css';
import 'swiper/css/pagination';

const slideMap =
[
    {
        image: IntroConnect,
        header: 'Intro.Connect.Header',
        message: 'Intro.Connect.Message'
    },
    {
        image: IntroDecentralized,
        header: 'Intro.Decentralized.Header',
        message: 'Intro.Decentralized.Message'
    },
    {
        image: IntroConnect,
        header: 'Intro.Secure.Header',
        message: 'Intro.Secure.Message'
    }
];

export default function IntroPage()
{
    const isWindows = useIsWindows();
    const swiperRef = useRef<SwiperType>(undefined);

    const [ subPage, setSubPage ] = useState<ReactNode>();
    const [ theme, setThemeState ] = useState(getTheme());

    const toggleTheme = useCallback(() =>
    {
        const next = getTheme() === 'light' ? 'dark' : 'light';

        setThemeState(next);

        void setTheme(next);
    }, []);

    const onSwiper = useCallback((swiper: SwiperType) =>
    {
        swiperRef.current = swiper;
    }, [ ]);

    return (
        <motion.div
            initial={ { scale: 0 } }
            animate={ { scale: 1 } }
            transition={ { type: 'tween' } }
            className='relative size-full'>

            <AnimatePresence>

                {
                    subPage
                }

            </AnimatePresence>

            <div className={ `flex size-full flex-col bg-base-1 px-4 ${ isWindows && 'pt-10' }` }>

                <div className='mt-4 flex items-center justify-between'>

                    <button
                        onClick={ () => { setSubPage(<IntroLanguage onClose={ () => { setSubPage(undefined); } } />); } }
                        type='button'
                        className='btn-normal flex h-10 w-fit items-center gap-2 rounded-lg p-2'>

                        <FiGlobe size={ 16 } />

                        <div className='text-small'>

                            {
                                T('Intro.Language')
                            }

                        </div>

                        <IoIosArrowDown size={ 16 } />

                    </button>

                    <button
                        onClick={ toggleTheme }
                        type='button'
                        className='btn-normal flex size-10 items-center justify-center rounded-lg text-txt-normal outline-0'>

                        {
                            theme === 'light' ? <FiMoon size={ 16 } /> : <FiSun size={ 16 } />
                        }

                    </button>

                </div>

                <Swiper
                    key={ getLanguage().code }
                    dir={ getDirection() }
                    modules={ [ Autoplay, Pagination ] }
                    onSwiper={ onSwiper }
                    loop={ true }
                    autoplay={ { disableOnInteraction: false, pauseOnMouseEnter: true, delay: 8000 } }
                    pagination={ { clickable: true } }
                    className='mt-8 size-full'>

                    {
                        slideMap.map((slide) => (
                            <SwiperSlide key={ slide.header }>

                                <div className='flex h-full cursor-pointer flex-col items-center'>

                                    <img
                                        src={ slide.image }
                                        className='size-60' />

                                    <h1 className='text-large font-bold text-txt-normal'>

                                        { T(slide.header) }

                                    </h1>

                                    <p className='text-center text-small text-txt-normal/75'>

                                        { T(slide.message) }

                                    </p>

                                </div>

                            </SwiperSlide>
                        ))
                    }

                </Swiper>

                <div className='flex flex-col gap-2'>

                    <button
                        onClick={ () => { setSubPage(<IntroWallet onClose={ () => { setSubPage(undefined); } } />); } }
                        type='button'
                        className='btn-primary flex h-12 items-center gap-2 rounded-lg p-2 outline-0'>

                        <FaPlusCircle size={ 32 } className='p-1.5' />

                        <div className='flex-1 text-start'>

                            {
                                T('Intro.Create')
                            }

                        </div>

                        <IoIosArrowForward size={ 16 } className={ getDirection() === 'rtl' ? 'rotate-180' : '' } />

                    </button>

                    <button
                        onClick={ () => { setSubPage(<IntroImport onClose={ () => { setSubPage(undefined); } } />); } }
                        type='button'
                        className='btn-normal flex h-12 items-center gap-2 rounded-lg p-2 outline-0'>

                        <LuImport size={ 32 } className='p-1.5' />

                        <div className='flex-1 text-start'>

                            {
                                T('Intro.Import')
                            }

                        </div>

                        <IoIosArrowForward size={ 16 } className={ getDirection() === 'rtl' ? 'rotate-180' : '' } />

                    </button>

                    <div className='mt-2 text-center text-tiny text-txt-muted'>

                        {
                            T('Intro.Version')
                        }

                    </div>

                </div>

            </div>

        </motion.div>
    );
}
