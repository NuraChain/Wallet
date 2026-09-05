import type { Swiper as SwiperType } from 'swiper';

import { IoClose } from 'react-icons/io5';
import { FiPlus } from 'react-icons/fi';
import { useReducedMotion } from 'motion/react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { FreeMode, Mousewheel } from 'swiper/modules';
import { useCallback, useEffect, useRef } from 'react';

import Text from '../ui/text';
import Button from '../ui/button';

import { selectedTint } from '../ui/menu';
import SiteIcon from '../site.icon';

import { cn } from '../../utility/cn';
import { getDirection, getLanguage, T } from '../../utility/language';
import { getSiteHost, type BrowserTab } from '../../core/browser';
import { Horizontal } from '../ui/stack';

import 'swiper/css';
import 'swiper/css/free-mode';
import 'swiper/css/mousewheel';

const chipBase =
    'flex h-9 w-full items-center gap-1 rounded-surface border ps-3 pe-1 transition-[background-color,border-color] duration-(--duration-fast) ease-initial';
const chipIdle = 'border-line bg-base-3 hover:bg-base-2';
const chipLive = selectedTint;

// A tab keeps its width until the strip runs out of room, and shares the space while there is
// still some — the same shape the row had when it was a flex row, kept through Swiper's own
// width by way of the important modifier.
const slideSize = 'w-30! grow';

export default function DashboardBrowserTabs({
    tabs,
    active,
    onPick,
    onClose,
    onAdd
}: {
    tabs: BrowserTab[];
    active: number;
    onPick: (id: number) => void;
    onClose: (id: number) => void;
    onAdd: () => void;
}) {
    const stripRef = useRef<SwiperType>(undefined);

    const reducedMotion = useReducedMotion();

    const at = tabs.findIndex((item) => item.id === active);

    const listed = tabs.some((item) => item.index >= 0);

    const onSwiper = useCallback((swiper: SwiperType) => {
        stripRef.current = swiper;
    }, []);

    useEffect(() => {
        if (at === -1) {
            return;
        }

        // The strip scrolls freely, so a tab opened or picked off screen has to be carried back
        // into view. Swiper is asked rather than the DOM: it owns the translate.
        stripRef.current?.slideTo(at, reducedMotion ? 0 : 300);
    }, [at, tabs.length, reducedMotion]);

    if (!listed) {
        return undefined;
    }

    return (
        <Horizontal className='shrink-0 items-center gap-1.5 border-b border-line bg-base-1 p-2'>
            <Button variant='chip' size='iconChip' aria-label={T('Dashboard.Browser.TabNew')} onClick={onAdd} className='size-8 shrink-0'>
                <FiPlus size={16} />
            </Button>

            <div className='min-w-0 flex-1'>
                <Swiper
                    key={getLanguage().code}
                    dir={getDirection()}
                    modules={[FreeMode, Mousewheel]}
                    onSwiper={onSwiper}
                    slidesPerView='auto'
                    spaceBetween={8}
                    freeMode={{ momentumBounce: false }}
                    mousewheel={{ forceToAxis: true }}
                    className='h-9 w-full'
                >
                    {tabs.map((item) => {
                        const url = item.index < 0 ? '' : item.entries[item.index];

                        const name = url.length > 0 ? getSiteHost(url) : T('Dashboard.Browser.TabEmpty');

                        return (
                            <SwiperSlide key={item.id} className={slideSize}>
                                <div className={cn(chipBase, item.id === active ? chipLive : chipIdle)}>
                                    <Button
                                        aria-current={item.id === active}
                                        title={url.length > 0 ? url : name}
                                        onClick={() => {
                                            onPick(item.id);
                                        }}
                                        className='flex min-w-0 flex-1 cursor-pointer items-center gap-1.5'
                                    >
                                        {url.length > 0 && <SiteIcon url={url} symbol={name.toUpperCase()} className='size-5 text-tiny' />}

                                        <Text
                                            variant={item.id === active ? 'captionStrong' : 'caption'}
                                            dir='ltr'
                                            className='min-w-0 flex-1 truncate text-start'
                                            text={name}
                                        />
                                    </Button>

                                    <Button
                                        aria-label={T('Dashboard.Browser.TabClose')}
                                        onClick={() => {
                                            onClose(item.id);
                                        }}
                                        className='flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-control text-txt-muted hover:bg-base-2'
                                    >
                                        <IoClose size={14} />
                                    </Button>
                                </div>
                            </SwiperSlide>
                        );
                    })}
                </Swiper>
            </div>
        </Horizontal>
    );
}
