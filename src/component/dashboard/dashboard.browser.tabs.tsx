import type { Swiper as SwiperType } from 'swiper';

import { X, Plus } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { FreeMode, Mousewheel } from 'swiper/modules';
import { useCallback, useEffect, useRef } from 'react';

import Text from '../../ui/text';
import Button from '../../ui/button';
import Toolbar from '../../ui/toolbar';

import SiteIcon from '../site.icon';

import { getDirection, getLanguage, T } from '../../utility/language';
import { getSiteHost } from '../../core/browser';

import 'swiper/css';
import 'swiper/css/free-mode';
import 'swiper/css/mousewheel';
import type { BrowserTab } from '../../type/browser';
import { Block } from '../../ui/wrap';
import { TabChip } from '../../ui/tabs';

// A tab keeps its width until the strip runs out of room, and shares the space while there is
// still some — the same shape the row had when it was a flex row, kept through Swiper's own
// width by way of the important modifier.
/* `grow` lets a lone tab take the whole strip, which on a wide window turned one site into a
   banner. The cap keeps a tab reading as a tab however few of them there are. */
const slideSize = 'w-30! max-w-52! grow';

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
        <Toolbar>
            <Button variant='chip' size='iconChipSmall' onClick={onAdd} shrink={false} icon={<Plus size={16} />} />

            <Block squeeze='x' grow>
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
                                <TabChip active={item.id === active}>
                                    <Button
                                        title={url.length > 0 ? url : name}
                                        onClick={() => {
                                            onPick(item.id);
                                        }}
                                        variant='rowTight'
                                        squeeze='x'
                                        grow
                                    >
                                        {url.length > 0 && <SiteIcon url={url} symbol={name.toUpperCase()} size={5} />}

                                        <Text
                                            variant={item.id === active ? 'captionStrong' : 'caption'}
                                            dir='ltr'
                                            squeeze='x'
                                            grow
                                            truncate
                                            align='start'
                                            text={name}
                                        />
                                    </Button>

                                    <Button
                                        onClick={() => {
                                            onClose(item.id);
                                        }}
                                        variant='tabClose'
                                        shrink={false}
                                        icon={<X size={14} />}
                                    />
                                </TabChip>
                            </SwiperSlide>
                        );
                    })}
                </Swiper>
            </Block>
        </Toolbar>
    );
}
