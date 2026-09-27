import type { Swiper as SwiperType } from 'swiper';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import { AnimatePresence, useReducedMotion } from 'motion/react';
import { Download, Globe, Moon, CirclePlus, Sun, ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react';
import { useRef, useCallback, useState, type ReactNode } from 'react';

import Text from '../ui/text';
import Button from '../ui/button';
import PageContainer from '../ui/container';
import IntroImport from '../component/intro/intro.import';
import IntroWallet from '../component/intro/intro.wallet';
import IntroLanguage from '../component/intro/intro.language';

import { Vertical } from '../ui/stack';

import { getTheme, setTheme } from '../utility/theme';
import { getDirection, getLanguage, T } from '../utility/language';
import { IntroArtConnect, IntroArtDecentralized, IntroArtSecure } from '../ui/intro.art';

import 'swiper/css';
import 'swiper/css/pagination';
import { IntroBar, IntroSlide, Screen } from '../ui/screen';

const slideMap = [
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

const entryMap: { key: string; icon: LucideIcon; label: string; variant: 'primary' | 'normal'; page: (close: () => void) => ReactNode }[] = [
    { key: 'create', icon: CirclePlus, label: 'Intro.Create', variant: 'primary', page: (close) => <IntroWallet onClose={close} /> },
    { key: 'import', icon: Download, label: 'Intro.Import', variant: 'normal', page: (close) => <IntroImport onClose={close} /> }
];

export default function IntroPage() {
    const swiperRef = useRef<SwiperType>(undefined);

    const reducedMotion = useReducedMotion();

    const [subPage, setSubPage] = useState<ReactNode>();
    const [theme, setThemeState] = useState(getTheme());

    const onCloseSub = useCallback(() => {
        setSubPage(undefined);
    }, []);

    const toggleTheme = useCallback(() => {
        const next = getTheme() === 'light' ? 'dark' : 'light';

        setThemeState(next);

        void setTheme(next);
    }, []);

    const onSwiper = useCallback((swiper: SwiperType) => {
        swiperRef.current = swiper;
    }, []);

    return (
        <Screen enter='grow'>
            <AnimatePresence>{subPage}</AnimatePresence>

            <PageContainer variant='intro'>
                <Vertical mx='auto' fill='both' maxWidth='lg'>
                    <IntroBar>
                        <Button
                            variant='normal'
                            onClick={() => {
                                setSubPage(<IntroLanguage onClose={onCloseSub} />);
                            }}
                            size='picker'
                            shrink
                        >
                            <Globe size={16} className='shrink-0' />

                            <Text variant='inherit' truncate size='small' text={T('Intro.Language')} />

                            <ChevronDown size={16} className='shrink-0' />
                        </Button>

                        <Button
                            variant='normal'
                            size='iconLarge'
                            onClick={toggleTheme}
                            shrink={false}
                            icon={theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                        />
                    </IntroBar>

                    <Swiper
                        key={getLanguage().code}
                        dir={getDirection()}
                        modules={[Autoplay, Pagination]}
                        onSwiper={onSwiper}
                        loop
                        autoplay={reducedMotion ? false : { disableOnInteraction: false, pauseOnMouseEnter: true, delay: 8000 }}
                        pagination={{ clickable: true }}
                        className='mt-4 min-h-0 w-full flex-1 sm:mt-8'
                    >
                        {slideMap.map((slide) => (
                            <SwiperSlide key={slide.header}>
                                <IntroSlide>
                                    <slide.art />

                                    <Text as='h1' variant='title' align='center' scaleUp text={T(slide.header)} />

                                    <Text as='p' variant='caption' maxWidth='sm' align='center' scaleUp text={T(slide.message)} />
                                </IntroSlide>
                            </SwiperSlide>
                        ))}
                    </Swiper>

                    <Vertical shrink={false} gap={2}>
                        {entryMap.map((item) => (
                            <Button
                                key={item.key}
                                variant={item.variant}
                                onClick={() => {
                                    setSubPage(item.page(onCloseSub));
                                }}
                                size='entry'
                            >
                                <item.icon size={32} className='shrink-0 p-1.5' />

                                <Text variant='inherit' grow truncate align='start' size='small' scaleUp text={T(item.label)} />

                                <ChevronRight size={16} className='shrink-0 rtl:rotate-180' />
                            </Button>
                        ))}

                        <Text mt={2} align='center' text={T('Intro.Version', __APP_VERSION__)} />
                    </Vertical>
                </Vertical>
            </PageContainer>
        </Screen>
    );
}
