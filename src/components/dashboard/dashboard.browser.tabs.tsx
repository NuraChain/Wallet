import { IoClose } from 'react-icons/io5';
import { FiPlus } from 'react-icons/fi';
import { useEffect, useRef } from 'react';

import Text from '../ui/text';
import Button from '../ui/button';

import { selectedTint } from '../ui/menu';
import TokenIcon from '../token.icon';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { getSiteHost, getSiteIcon, type BrowserTab } from '../../core/browser';
import { Horizontal } from '../ui/stack';

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
 * The width lives here now. It used to be in `style.css`, because Swiper set `.swiper-slide { width:
 * 100% }` from its own unlayered sheet and outranked any utility written on the element — so the one
 * declaration that decided how many tabs were visible had to sit three files away from the chip. With
 * the strip scrolling natively there is nothing to outrank it: `w-30` is the resting width and `grow`
 * is what lets two chips share a wide row instead of huddling at one end.
 */
const chipBase = 'flex h-9 w-30 grow items-center gap-1 rounded-surface border ps-3 pe-1 transition-[background-color,border-color] duration-(--duration-fast) ease-initial';
const chipIdle = 'border-line bg-base-3 hover:bg-base-2';
const chipLive = selectedTint;

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
 * The list is a native `overflow-x` scroller. It was a Swiper in free mode at `slidesPerView: 'auto'`,
 * which is a description of what the browser already does — and it came with a measuring step that had
 * to be told twice to re-run, plus a rule in `style.css` to defeat the library's own slide width. The
 * chips size themselves here because nothing is fighting them for it.
 *
 * What the platform gives back: touch dragging and momentum on a phone, and a trackpad's horizontal
 * gesture on a desktop, all of it the same scrolling every other list in the OS does. What it does not
 * give back is dragging the strip with a held mouse button, and a vertical wheel scrolls it only where
 * the browser chooses to redirect one — the library emulated both. Neither is the way the strip is
 * used on the platform this app ships to, and neither was worth 78 KB on the route that has it.
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
    const stripRef = useRef<HTMLDivElement>(null);

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
    // closing the one that was there. `scrollIntoView` on the chip itself rather than a computed
    // offset: the chips grow to share the row, so their positions are not a function of the index.
    useEffect(() =>
    {
        if (at < 0)
        {
            return;
        }

        stripRef.current?.children[at]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [ at, tabs.length ]);

    if (!listed)
    {
        return undefined;
    }

    return (
        <Horizontal className='shrink-0 items-center gap-1.5 border-b border-line bg-base-1 p-2'>

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
                  * A scroll container, not a carousel.
                  *
                  * This was a Swiper in free mode at `slidesPerView: 'auto'`, which is a description of
                  * what `overflow-x: auto` already does — plus `observer`/`observeParents` to answer
                  * being measured before the row had a width, a manual `update()` before every move,
                  * and a rule in `style.css` to defeat the library's own slide width. A native scroller
                  * has no measuring step to get wrong, and the browser's own momentum is the one the
                  * platform uses everywhere else.
                  *
                  * `scroll-hidden` is the app's existing opt-out of the native bar; the strip is
                  * dragged and swiped rather than scrolled by its own gutter.
                  */ }
                <div
                    ref={ stripRef }
                    className='scroll-hidden flex w-full gap-2 overflow-x-auto overscroll-x-contain'>

                    {
                        tabs.map((item) =>
                        {
                            const url = item.index < 0 ? '' : item.entries[item.index];

                            const name = url.length > 0 ? getSiteHost(url) : T('Dashboard.Browser.TabEmpty');

                            return (
                                <div key={ item.id } className={ cn(chipBase, item.id === active ? chipLive : chipIdle) }>

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
                                                    className='size-5 text-tiny' />
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
                                        className='flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-control text-txt-muted hover:bg-base-2'>

                                        <IoClose size={ 14 } />

                                    </Button>

                                </div>
                            );
                        })
                    }

                </div>

            </div>

        </Horizontal>
    );
}
