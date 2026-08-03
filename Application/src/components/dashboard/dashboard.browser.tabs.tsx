import type { Swiper as SwiperType } from 'swiper';

import { IoClose } from 'react-icons/io5';
import { Swiper, SwiperSlide } from 'swiper/react';
import { FiPlus, FiSettings } from 'react-icons/fi';
import { useEffect, useRef, useState } from 'react';

import Text from '../ui/text';
import Button from '../ui/button';
import TokenIcon from '../token.icon';

import { cn } from '../../utility/cn';
import { getDirection, getLanguage, T } from '../../utility/language';
import { getSiteHost, getSiteIcon, type BrowserTab } from '../../core/browser';

import 'swiper/css';

/**
 * The chip a tab is drawn as.
 *
 * Not a `Button`, because a chip carries two controls — picking the tab and closing it — and a button
 * inside a button is not markup a browser will render. The fill therefore lives on the row and the two
 * real buttons inside it are `bare`, which is what that variant exists for.
 *
 * The colours are the same pair every selected/unselected surface in the app uses, so the strip reads
 * as the nav bar does rather than introducing a third idea of what "active" looks like.
 */
const chipBase = 'flex h-9 w-full items-center gap-1.5 rounded-xl border ps-2.5 pe-1 transition-[background-color,border-color] duration-300 ease-initial';
const chipIdle = 'border-glass-line bg-base-3 hover:bg-base-2';
const chipLive = 'border-btn-primary-border bg-btn-primary/15';

/**
 * The narrowest a chip is allowed to get, and the space between two of them.
 *
 * Together these decide how many tabs the strip shows: the list is handed a whole number of chips that
 * fit the width it was given, so the chips divide that width evenly instead of carrying a fixed size
 * that leaves a stripe of dead space on one screen and overflows another.
 */
const chipMin = 120;
const chipGap = 6;

/**
 * DashboardBrowserTabs - The open tabs, as a strip under the browser toolbar.
 *
 * A strip rather than the tab-count button and overlay a phone browser would use: the toolbar is
 * already five controls wide at 360px, and a sixth left the address field with about a character of
 * room. Laid out here the same surface answers all three things a tab bar is for — which tabs exist,
 * which one is in front, and getting rid of one — without a dialog in between. It rides with the start
 * screen, appearing and going away with it, since that is where a tab is picked.
 *
 * One row: settings, then new-tab, then the list. The two controls come first because they are always
 * in the same place, while the list beside them is the part that moves — a control the list can scroll
 * out of reach is one the user has to go looking for.
 *
 * How many tabs are on screen is measured rather than assumed. The list is a Swiper told how many
 * slides fit the width it actually has, recomputed whenever that width changes, and the rest scroll in
 * from either side. The effect below brings the front tab into view when it is chosen from somewhere
 * else — picking one, or closing the one that was there.
 *
 * A tab that has never been given an address has no host to show, so it is named for what it is.
 * @param {object} props Component props.
 * @param {BrowserTab[]} props.tabs The open tabs, in the order they were opened.
 * @param {number} props.active Id of the tab in front.
 * @param {(id: number) => void} props.onPick Brings a tab to the front.
 * @param {(id: number) => void} props.onClose Closes a tab.
 * @param {() => void} props.onAdd Opens a new, empty tab.
 * @param {() => void} props.onSettings Opens the browser's settings dialog.
 * @returns {JSX.Element} The tab strip.
 */
export default function DashboardBrowserTabs({ tabs, active, onPick, onClose, onAdd, onSettings }: { tabs: BrowserTab[]; active: number; onPick: (id: number) => void; onClose: (id: number) => void; onAdd: () => void; onSettings: () => void })
{
    const boxRef = useRef<HTMLDivElement>(null);
    const swiperRef = useRef<SwiperType>(undefined);

    const [ perView, setPerView ] = useState(2);

    const at = tabs.findIndex((item) => item.id === active);

    // Nothing to list until something is actually open. A fresh browser holds one tab that has never
    // been given an address, and a lone chip reading "New tab" beside a new-tab button says nothing.
    //
    // The test is whether any tab has a page, not whether this one does: once a second tab exists the
    // empty one is a real place to switch back to, and leaving it out would put the tab in front among
    // the chips that are missing.
    const listed = tabs.some((item) => item.index >= 0);

    // Never more slots than there are tabs. The width says how many chips fit, but handing Swiper that
    // number with fewer tabs open divides the row anyway and leaves the empty remainder sitting there
    // looking like a blank tab. Capped, the chips share out whatever room there is — one tab spans the
    // strip, two halve it — and scrolling only starts once they genuinely outgrow it.
    const shown = Math.max(1, Math.min(perView, tabs.length));

    // Measured off the box the list actually occupies, not the window: the two controls beside it take
    // a fixed bite out of the row, and the strip is the same component on a 360px phone and a resized
    // desktop window. A width of zero is what an unmeasured frame reports, so it is left alone.
    useEffect(() =>
    {
        const measure = () =>
        {
            const width = boxRef.current?.getBoundingClientRect().width ?? 0;

            if (width < 1)
            {
                return;
            }

            setPerView(Math.max(1, Math.floor((width + chipGap) / (chipMin + chipGap))));
        };

        measure();

        const observer = new ResizeObserver(measure);

        if (boxRef.current !== null)
        {
            observer.observe(boxRef.current);
        }

        return () => { observer.disconnect(); };
    }, [ listed ]);

    // Told to update first: the slide list changes as tabs are opened and closed, and sliding to an
    // index Swiper has not measured yet lands on the wrong one.
    useEffect(() =>
    {
        if (at < 0)
        {
            return;
        }

        swiperRef.current?.update();
        swiperRef.current?.slideTo(at);
    }, [ at, tabs.length, shown ]);

    return (
        <div className='flex shrink-0 items-center gap-1.5 border-b border-glass-line bg-base-1 p-2 backdrop-blur-xl'>

            <Button
                variant='chip'
                size='iconChip'
                aria-label={ T('Dashboard.Browser.Settings') }
                onClick={ onSettings }
                className='size-8 shrink-0'>

                <FiSettings size={ 15 } />

            </Button>

            <Button
                variant='chip'
                size='iconChip'
                aria-label={ T('Dashboard.Browser.TabNew') }
                onClick={ onAdd }
                className='size-8 shrink-0'>

                <FiPlus size={ 16 } />

            </Button>

            {
                listed &&
                (
                    <div
                        ref={ boxRef }
                        className='min-w-0 flex-1'>

                        <Swiper
                            key={ getLanguage().code }
                            dir={ getDirection() }
                            speed={ 250 }
                            spaceBetween={ chipGap }
                            slidesPerView={ shown }
                            initialSlide={ at < 0 ? 0 : at }
                            onSwiper={ (swiper) => { swiperRef.current = swiper; } }
                            className='w-full'>

                            {
                                tabs.map((item) =>
                                {
                                    const url = item.index < 0 ? '' : item.entries[item.index];

                                    const name = url.length > 0 ? getSiteHost(url) : T('Dashboard.Browser.TabEmpty');

                                    return (
                                        <SwiperSlide key={ item.id }>

                                            <div className={ cn(chipBase, item.id === active ? chipLive : chipIdle) }>

                                                <Button
                                                    aria-current={ item.id === active }
                                                    title={ url.length > 0 ? url : name }
                                                    onClick={ () => { onPick(item.id); } }
                                                    className='flex min-w-0 flex-1 cursor-pointer items-center gap-1.5'>

                                                    {
                                                        url.length > 0 &&
                                                        (
                                                            <TokenIcon
                                                                src={ getSiteIcon(url) }
                                                                symbol={ name.toUpperCase() }
                                                                className='size-4 text-[0.5rem]' />
                                                        )
                                                    }

                                                    <Text
                                                        variant={ item.id === active ? 'captionStrong' : 'caption' }
                                                        className='min-w-0 flex-1 truncate text-start'>

                                                        <span dir='ltr'>

                                                            { name }

                                                        </span>

                                                    </Text>

                                                </Button>

                                                { /*
                                                  * Always present, including on the last tab: closing it leaves
                                                  * an empty tab behind rather than an empty strip, so the
                                                  * control never has to explain why it is missing.
                                                  */ }
                                                <Button
                                                    aria-label={ T('Dashboard.Browser.TabClose') }
                                                    onClick={ () => { onClose(item.id); } }
                                                    className='flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-lg text-txt-muted hover:bg-base-2'>

                                                    <IoClose size={ 13 } />

                                                </Button>

                                            </div>

                                        </SwiperSlide>
                                    );
                                })
                            }

                        </Swiper>

                    </div>
                )
            }

        </div>
    );
}
