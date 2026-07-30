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

import IntroImport from '../components/intro/intro.import';
import IntroWallet from '../components/intro/intro.wallet';
import IntroLanguage from '../components/intro/intro.language';

import { getDirection, getLanguage, T } from '../utility/language';
import { getTheme, setTheme } from '../utility/theme';
import { IntroArtConnect, IntroArtDecentralized, IntroArtSecure } from '../components/intro/intro.art';

import 'swiper/css';
import 'swiper/css/pagination';

const slideMap =
[
    {
        art: IntroArtConnect,
        header: 'Intro.Connect.Header',
        message: 'Intro.Connect.Message'
    },
    {
        art: IntroArtDecentralized,
        header: 'Intro.Decentralized.Header',
        message: 'Intro.Decentralized.Message'
    },
    {
        art: IntroArtSecure,
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

            <div className={ `flex size-full flex-col bg-base-1 px-4 pb-4 sm:px-6 sm:pb-6 ${ isWindows ? 'pt-10' : 'pt-[env(safe-area-inset-top)]' }` }>

                <div className='mx-auto flex size-full max-w-lg flex-col'>

                    <div className='mt-3 flex shrink-0 items-center justify-between gap-2 sm:mt-4'>

                        <button
                            onClick={ () => { setSubPage(<IntroLanguage onClose={ () => { setSubPage(undefined); } } />); } }
                            type='button'
                            className='btn-normal flex h-10 w-fit shrink items-center gap-2 rounded-lg p-2'>

                            <FiGlobe size={ 16 } className='shrink-0' />

                            <div className='truncate text-small'>

                                {
                                    T('Intro.Language')
                                }

                            </div>

                            <IoIosArrowDown size={ 16 } className='shrink-0' />

                        </button>

                        <button
                            onClick={ toggleTheme }
                            type='button'
                            className='btn-normal flex size-10 shrink-0 items-center justify-center rounded-lg text-txt-normal outline-0'>

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
                        className='mt-4 min-h-0 w-full flex-1 sm:mt-8'>

                        {
                            slideMap.map((slide) => (
                                <SwiperSlide key={ slide.header }>

                                    <div className='flex h-full cursor-pointer flex-col items-center justify-center gap-2 px-2 pb-10'>

                                        <slide.art className='h-32 max-h-[40%] w-auto max-w-full sm:h-44 md:h-56' />

                                        <h1 className='text-center text-medium font-bold text-txt-normal sm:text-large'>

                                            { T(slide.header) }

                                        </h1>

                                        <p className='max-w-sm text-center text-tiny text-txt-normal/75 sm:text-small'>

                                            { T(slide.message) }

                                        </p>

                                    </div>

                                </SwiperSlide>
                            ))
                        }

                    </Swiper>

                    <div className='flex shrink-0 flex-col gap-2'>

                        <button
                            onClick={ () => { setSubPage(<IntroWallet onClose={ () => { setSubPage(undefined); } } />); } }
                            type='button'
                            className='btn-primary flex h-12 items-center gap-2 rounded-lg p-2 outline-0'>

                            <FaPlusCircle size={ 32 } className='shrink-0 p-1.5' />

                            <div className='flex-1 truncate text-start text-small sm:text-medium'>

                                {
                                    T('Intro.Create')
                                }

                            </div>

                            <IoIosArrowForward size={ 16 } className={ `shrink-0 ${ getDirection() === 'rtl' ? 'rotate-180' : '' }` } />

                        </button>

                        <button
                            onClick={ () => { setSubPage(<IntroImport onClose={ () => { setSubPage(undefined); } } />); } }
                            type='button'
                            className='btn-normal flex h-12 items-center gap-2 rounded-lg p-2 outline-0'>

                            <LuImport size={ 32 } className='shrink-0 p-1.5' />

                            <div className='flex-1 truncate text-start text-small sm:text-medium'>

                                {
                                    T('Intro.Import')
                                }

                            </div>

                            <IoIosArrowForward size={ 16 } className={ `shrink-0 ${ getDirection() === 'rtl' ? 'rotate-180' : '' }` } />

                        </button>

                        <div className='mt-2 text-center text-tiny text-txt-muted'>

                            {
                                T('Intro.Version')
                            }

                        </div>

                    </div>

                </div>

            </div>

        </motion.div>
    );
}
