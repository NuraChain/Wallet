import type { Swiper as SwiperType } from 'swiper';

import { IoClose } from 'react-icons/io5';
import { FiPlus } from 'react-icons/fi';
import { useEffect, useRef } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { FreeMode, Mousewheel } from 'swiper/modules';

import Text from '../ui/text';
import Button from '../ui/button';
import TokenIcon from '../token.icon';

import { cn } from '../../utility/cn';
import { getDirection, getLanguage, T } from '../../utility/language';
import { getSiteHost, getSiteIcon, type BrowserTab } from '../../core/browser';

import 'swiper/css';
import 'swiper/css/free-mode';

/**
 * The chip a tab is drawn as.
 *
 * Not a `Button`, because a chip carries two controls — picking the tab and closing it — and a button
 * inside a button is not markup a browser will render. The fill therefore lives on the row and the two
 * real buttons inside it are `bare`, which is what that variant exists for.
 *
 * The colours are the same pair every selected/unselected surface in the app uses, so the strip reads
 * as the nav bar does rather than introducing a third idea of what "active" looks like.
 *
 * The width is not here: the slide around it owns that, from `style.css`, because Swiper reads it out
 * of the stylesheet and the library's own rule would outrank a utility written on the element.
 */
const chipBase = 'flex h-9 w-full items-center gap-1.5 rounded-xl border ps-2.5 pe-1 transition-[background-color,border-color] duration-300 ease-initial';
const chipIdle = 'border-glass-line bg-base-3 hover:bg-base-2';
const chipLive = 'border-btn-primary-border bg-btn-primary/15';

/** The space between two chips, in pixels, since Swiper takes this as a number rather than a class. */
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
 * One row: new-tab, then the list. The button comes first because it is always in the same place,
 * while the list beside it is the part that moves — a control the list can scroll out of reach is one
 * the user has to go looking for.
 *
 * The list is a Swiper in **free mode at `slidesPerView: 'auto'`**, and every part of that matters.
 * `auto` means the chips size themselves and Swiper counts nothing: it once took a slide count measured
 * off the row by a `ResizeObserver`, and a count taken while the strip was mounting is what left the
 * list showing the tab in front and nothing else. Free mode is what makes it a scrolling row rather
 * than a carousel that snaps a chip to the edge. Between them, dragging with a mouse and turning the
 * wheel over it — the two things a phone gets from touch for free — are the library's own `simulateTouch`
 * and `Mousewheel`, so there is no drag handling written here to disagree with it.
 *
 * A tab that has never been given an address has no host to show, so it is named for what it is.
 * @param {object} props Component props.
 * @param {BrowserTab[]} props.tabs The open tabs, in the order they were opened.
 * @param {number} props.active Id of the tab in front.
 * @param {(id: number) => void} props.onPick Brings a tab to the front.
 * @param {(id: number) => void} props.onClose Closes a tab.
 * @param {() => void} props.onAdd Opens a new, empty tab.
 * @returns {JSX.Element} The tab strip.
 */
export default function DashboardBrowserTabs({ tabs, active, onPick, onClose, onAdd }: { tabs: BrowserTab[]; active: number; onPick: (id: number) => void; onClose: (id: number) => void; onAdd: () => void })
{
    const swiperRef = useRef<SwiperType>(undefined);

    const at = tabs.findIndex((item) => item.id === active);

    // Nothing to show until something is actually open. A fresh browser holds one tab that has never
    // been given an address, so the whole strip would be a new-tab button beside a chip reading "New
    // tab" — controls for a thing the user has not started doing yet. It arrives with the first page.
    //
    // The test is whether any tab has a page, not whether this one does: once a second tab exists the
    // empty one is a real place to switch back to, and leaving it out would put the tab in front among
    // the chips that are missing.
    const listed = tabs.some((item) => item.index >= 0);

    // Brings the tab in front into view when it was chosen from somewhere else — opening one, or
    // closing the one that was there. Told to update first, since a slide added in this same commit is
    // one Swiper has not measured yet and sliding to it would land on the wrong chip.
    useEffect(() =>
    {
        if (at < 0)
        {
            return;
        }

        swiperRef.current?.update();
        swiperRef.current?.slideTo(at);
    }, [ at, tabs.length ]);

    if (!listed)
    {
        return undefined;
    }

    return (
        <div className='flex shrink-0 items-center gap-1.5 border-b border-glass-line bg-base-1 p-2 backdrop-blur-xl'>

            <Button
                variant='chip'
                size='iconChip'
                aria-label={ T('Dashboard.Browser.TabNew') }
                onClick={ onAdd }
                className='size-8 shrink-0'>

                <FiPlus size={ 16 } />

            </Button>

            <div className='min-w-0 flex-1'>

                { /*
                  * `observer` and `observeParents` are Swiper's own answer to being measured too early.
                  * The strip is mounted and unmounted with the start screen, and a Swiper that
                  * initialises before its row has a width lays every chip out against zero and leaves
                  * the row looking empty. These re-measure when the element or anything above it
                  * changes, which is the same job the old `ResizeObserver` was doing by hand.
                  */ }
                <Swiper
                    freeMode
                    observer
                    observeParents
                    key={ getLanguage().code }
                    dir={ getDirection() }
                    speed={ 250 }
                    modules={ [ FreeMode, Mousewheel ] }
                    slidesPerView='auto'
                    spaceBetween={ chipGap }
                    initialSlide={ at < 0 ? 0 : at }
                    mousewheel={ { forceToAxis: true } }
                    onSwiper={ (swiper) => { swiperRef.current = swiper; } }
                    className='tab-strip w-full'>

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
                                                        kind='unknown'
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

        </div>
    );
}
