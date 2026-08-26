import type { IconType } from 'react-icons';
import type { Swiper as SwiperType } from 'swiper';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import { motion, AnimatePresence } from 'motion/react';
import { FiDownload, FiGlobe, FiMoon, FiPlusCircle, FiSun } from 'react-icons/fi';
import { IoChevronDown, IoChevronForward } from 'react-icons/io5';
import { useRef, useCallback, useState, useMemo, type ReactNode } from 'react';

import Text from '../components/ui/text';
import Button from '../components/ui/button';
import PageContainer from '../layout/container';
import IntroImport from '../components/intro/intro.import';
import IntroWallet from '../components/intro/intro.wallet';
import IntroLanguage from '../components/intro/intro.language';

import { Horizontal, Vertical } from '../components/ui/stack';

import { getTheme, setTheme } from '../utility/theme';
import { getDirection, getLanguage, T } from '../utility/language';
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

/**
 * The two ways in. Same tall row with a leading glyph, a filling label and a chevron; only the fill,
 * the icon, the label and which sheet opens differ.
 */
const entryMap: { key: string; icon: IconType; label: string; variant: 'primary' | 'normal'; page: (close: () => void) => ReactNode }[] =
[
    { key: 'create', icon: FiPlusCircle, label: 'Intro.Create', variant: 'primary', page: (close) => <IntroWallet onClose={ close } /> },
    { key: 'import', icon: FiDownload, label: 'Intro.Import', variant: 'normal', page: (close) => <IntroImport onClose={ close } /> }
];

export default function IntroPage()
{
    const swiperRef = useRef<SwiperType>(undefined);

    // Read once rather than subscribed to: the preference cannot change while this screen is up
    // without the window losing focus, and the carousel is rebuilt on language change anyway.
    //
    // The global reduced-motion rule in `style.css` collapses CSS transitions and animations, but
    // Swiper drives its autoplay from JavaScript timers writing inline transforms, which that rule
    // never reaches. Left enabled it advances every eight seconds against an explicit user setting,
    // and `disableOnInteraction` means a touch user cannot even pause it by swiping — hover is the
    // only brake, and touch has none.
    const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

    const [ subPage, setSubPage ] = useState<ReactNode>();
    const [ theme, setThemeState ] = useState(getTheme());

    const onCloseSub = useCallback(() =>
    {
        setSubPage(undefined);
    }, [ ]);

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

            <PageContainer variant='intro'>

                <Vertical className='mx-auto size-full max-w-lg'>

                    <Horizontal className='mt-3 shrink-0 items-center justify-between gap-2 sm:mt-4'>

                        <Button
                            variant='normal'
                            onClick={ () => { setSubPage(<IntroLanguage onClose={ onCloseSub } />); } }
                            className='h-10 w-fit shrink justify-start rounded-control p-2'>

                            <FiGlobe size={ 16 } className='shrink-0' />

                            <Text
                                variant='inherit'
                                className='truncate text-small'>

                                {
                                    T('Intro.Language')
                                }

                            </Text>

                            <IoChevronDown size={ 16 } className='shrink-0' />

                        </Button>

                        <Button
                            variant='normal'
                            size='iconLarge'
                            onClick={ toggleTheme }
                            className='shrink-0 text-txt-normal'>

                            {
                                theme === 'light' ? <FiMoon size={ 16 } /> : <FiSun size={ 16 } />
                            }

                        </Button>

                    </Horizontal>

                    <Swiper
                        key={ getLanguage().code }
                        dir={ getDirection() }
                        modules={ [ Autoplay, Pagination ] }
                        onSwiper={ onSwiper }
                        loop={ true }

                        // Off entirely under reduced motion: the slides stay where the user put them
                        // and remain reachable through the pagination bullets, which are clickable.
                        autoplay={ reducedMotion ? false : { disableOnInteraction: false, pauseOnMouseEnter: true, delay: 8000 } }
                        pagination={ { clickable: true } }
                        className='mt-4 min-h-0 w-full flex-1 sm:mt-8'>

                        {
                            slideMap.map((slide) => (
                                <SwiperSlide key={ slide.header }>

                                    <Vertical className='h-full cursor-pointer items-center justify-center gap-2 px-2 pb-10'>

                                        <slide.art className='h-32 max-h-[40%] w-auto max-w-full sm:h-44 md:h-56' />

                                        <Text
                                            as='h1'
                                            variant='title'
                                            className='text-center sm:text-large'>

                                            { T(slide.header) }

                                        </Text>

                                        <Text
                                            as='p'
                                            variant='caption'
                                            className='max-w-sm text-center sm:text-small'>

                                            { T(slide.message) }

                                        </Text>

                                    </Vertical>

                                </SwiperSlide>
                            ))
                        }

                    </Swiper>

                    <Vertical className='shrink-0 gap-2'>

                        {
                            entryMap.map((item) => (
                                <Button
                                    key={ item.key }
                                    variant={ item.variant }
                                    onClick={ () => { setSubPage(item.page(onCloseSub)); } }
                                    className='h-12 rounded-control p-2'>

                                    <item.icon size={ 32 } className='shrink-0 p-1.5' />

                                    { /* No colour of its own: the label takes the fill's, which is
                                         reversed on the primary entry and normal on the other. */ }
                                    <Text
                                        variant='inherit'
                                        className='flex-1 truncate text-start text-small sm:text-medium'>

                                        { T(item.label) }

                                    </Text>

                                    <IoChevronForward size={ 16 } className='shrink-0 rtl:rotate-180' />

                                </Button>
                            ))
                        }

                        <Text
                            className='mt-2 text-center'
                            text={ T('Intro.Version', __APP_VERSION__) } />

                    </Vertical>

                </Vertical>

            </PageContainer>

        </motion.div>
    );
}
