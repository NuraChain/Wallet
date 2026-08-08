import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type UIEvent } from 'react';

import Spinner from '../components/ui/spinner';

/**
 * Which of the four things the pull is doing, which is all the gesture needs to know about itself.
 *
 * Held in a ref rather than state: every one of these transitions happens inside an event listener that
 * paints the result itself, so making them renders would buy nothing and cost a frame.
 */
type Phase = 'idle' | 'pulling' | 'refreshing' | 'releasing';

/**
 * Distance the content travels before a release counts as a refresh.
 */
const threshold = 64;

/**
 * The distance the pull leans towards and never arrives at.
 *
 * `Damped` bends the raw travel towards this, so the pull runs out of give rather than stopping against
 * a wall — a hard cap is felt as the gesture breaking, since the finger keeps moving and the content
 * stops answering.
 */
const limit = threshold * 1.6;

/**
 * How long the content takes to travel home once the gesture lets go, and the curve it runs on: leaves
 * quickly, arrives slowly, no overshoot.
 */
const spring = 320;
const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * How long the wheel has to go quiet before the pull is treated as let go.
 *
 * Long enough to ride out the gap between two notches of a stepped mouse wheel and the tail of a
 * trackpad flick, short enough that the indicator does not hang there after the user has stopped.
 */
const settleDelay = 140;

/**
 * What a wheel's reported pixels are divided by before they count as travel.
 *
 * A notch names about 100px and is nothing like 100px of finger, so it is scaled down — by exactly
 * enough that one notch stays short of `threshold` and two clear it.
 */
const wheelScale = 1.5;

/**
 * damped - Turns raw gesture travel into the distance the content actually moves.
 *
 * Starts out following the input one-to-one, then gives progressively less as it approaches `limit`, so
 * the resistance builds rather than arriving all at once at a clamp.
 * @param {number} distance Raw travel accumulated by the gesture, in pixels.
 * @returns {number} How far the content should sit below its resting place.
 */
const damped = (distance: number) => limit * (1 - Math.exp(-Math.max(distance, 0) / limit));

/**
 * undamped - `damped` run backwards.
 *
 * Needed to grab a pull that is already on its way home: the gesture resumes from raw travel, so the
 * distance currently on screen has to be turned back into the travel that would have produced it.
 * @param {number} offset A distance the content is currently displaced by.
 * @returns {number} The raw travel that damps to it.
 */
const undamped = (offset: number) => -limit * Math.log(1 - Math.min(Math.max(offset, 0) / limit, 0.999));

/**
 * painted - Where an element actually sits this instant, mid-transition included.
 *
 * The resting value of a spring is written the moment it starts, so the ref that drives the gesture
 * says `0` for the whole 320ms the content spends travelling there. Interrupting one has to read the
 * screen instead, or the grab starts by teleporting.
 * @param {HTMLElement} element The element to measure.
 * @returns {number} Its current vertical translation in pixels.
 */
const painted = (element: HTMLElement) =>
{
    const { transform } = getComputedStyle(element);

    if (transform === 'none' || transform === '')
    {
        return 0;
    }

    return new DOMMatrixReadOnly(transform).m42;
};

/**
 * ScrollArea - A scroll container with an overlay scrollbar.
 *
 * The native scrollbar is hidden (`.scroll-hidden`) and replaced by an absolutely positioned thumb, so the bar floats over the content instead of reserving a column of layout width — the content keeps the same width whether it scrolls or not.
 *
 * The thumb rests at 5% opacity and lifts to 15% on hover — the same two weights the native bar's `--scrollbar-thumb` pair carries — so it stays out of the way of the glass surfaces underneath. Only a drag brings it to full, since by then the user is holding it and wants to see what they are moving.
 *
 * Pulling down while already at the top runs `onRefresh`, the gesture every mobile feed has trained
 * people to expect. The pull is damped so it reads as tension rather than free movement, and springs
 * home when it is let go.
 *
 * **Neither the pull nor the thumb travels through React.** Both are written straight to the DOM, once
 * per animation frame, because both are driven by events that fire faster than the display refreshes —
 * a trackpad reports well past 60Hz and a scroll fires per pixel. Rendering per event queues work that
 * is thrown away before it is ever painted, which is felt as the gesture lagging the finger. Only the
 * two things that genuinely change what is on screen — whether the thumb exists, whether the glyph is
 * spinning — are state.
 * @param {object} props Component props.
 * @param {string} [props.className] Extra classes for the outer (positioned) wrapper.
 * @param {ReactNode} props.children The scrollable content.
 * @param {(top: number, delta: number, bottom: number) => void} [props.onScrollChange] Receives the scroll offset, the signed distance since the previous event, and how much scrollable content is still left below.
 * @param {() => Promise<void> | void} [props.onRefresh] Called when the user pulls past the threshold. Omit to disable the gesture.
 * @returns {JSX.Element} The scroll container.
 */
export default function ScrollArea({ className = '', children, onScrollChange, onRefresh }: { className?: string; children: ReactNode; onScrollChange?: (top: number, delta: number, bottom: number) => void; onRefresh?: () => Promise<void> | void })
{
    const lastRef = useRef(0);
    const barRef = useRef<HTMLDivElement>(null);
    const glyphRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const indicatorRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ origin: number; top: number } | undefined>(undefined);

    // The live gesture. `raw` is what the input has travelled, `pull` is what that damps to and what is
    // on screen; keeping both means resuming an interrupted pull does not have to invert anything twice.
    const rawRef = useRef(0);
    const pullRef = useRef(0);
    const phaseRef = useRef<Phase>('idle');
    const frameRef = useRef<number | undefined>(undefined);

    // Where the finger went down and how far the pull had already travelled at that moment, so a grab
    // mid-spring continues the distance instead of restarting it.
    const originRef = useRef<{ y: number; seed: number } | undefined>(undefined);
    const refreshRef = useRef(onRefresh);

    // A wheel has no `touchend`, so the release runs on a timer instead; the spring needs its own timer
    // to know when it has arrived, since a transition that changes nothing fires no event.
    const settleRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const springRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // When the last wheel event arrived, which is how a deliberate pull is told from the momentum of
    // the scroll that reached the top.
    const lastWheelRef = useRef(0);

    const [ dragging, setDragging ] = useState(false);
    const [ refreshing, setRefreshing ] = useState(false);
    const [ thumb, setThumb ] = useState({ size: 0, visible: false });

    // Kept in a ref so the gesture listeners below can stay bound for the life of the component instead
    // of being torn down and re-attached every time the parent re-renders with a new closure.
    refreshRef.current = onRefresh;

    const measure = useCallback(() =>
    {
        const element = viewportRef.current;

        if (element === null)
        {
            return;
        }

        const scrollable = element.scrollHeight - element.clientHeight;

        if (scrollable <= 0)
        {
            setThumb((current) => (current.visible ? { size: 0, visible: false } : current));

            return;
        }

        const size = Math.max((element.clientHeight / element.scrollHeight) * element.clientHeight, 32);

        // Whether the thumb exists and how tall it is changes when the content does, which is rare. Where
        // it sits changes every scroll event, so it is painted rather than rendered — and the state is
        // returned unchanged when nothing about it moved, so scrolling a list of a fixed length renders
        // exactly zero times.
        setThumb((current) => (current.visible && current.size === size ? current : { size, visible: true }));

        if (barRef.current !== null)
        {
            barRef.current.style.transform = `translateY(${ (element.scrollTop / scrollable) * (element.clientHeight - size) }px)`;
        }
    }, [ ]);

    useEffect(() =>
    {
        const element = viewportRef.current;
        const observer = new ResizeObserver(() => { measure(); });

        if (element !== null)
        {
            measure();

            observer.observe(element);

            for (const child of element.children)
            {
                observer.observe(child);
            }
        }

        return () => { observer.disconnect(); };
    }, [ measure ]);

    // The thumb is painted by `measure`, which cannot reach it on the pass that first mounts it. One
    // more call once it exists puts it in the right place; the equality check above stops this settling
    // into a loop.
    useEffect(() => { measure(); }, [ measure, thumb.visible ]);

    useEffect(() =>
    {
        const element = viewportRef.current;

        if (element === null)
        {
            return undefined;
        }

        /**
         * Everything the gesture puts on screen, in one place and never more than once a frame.
         */
        const paint = () =>
        {
            frameRef.current = undefined;

            const offset = pullRef.current;
            const badge = indicatorRef.current;
            const glyph = glyphRef.current;

            // Cleared rather than zeroed at rest, so the element goes back to carrying no inline style at
            // all and the classes below are what describe it again.
            element.style.transform = offset === 0 ? '' : `translateY(${ offset }px)`;

            if (badge !== null)
            {
                badge.style.height = offset === 0 ? '' : `${ offset }px`;
                badge.style.opacity = offset === 0 ? '' : `${ Math.min(offset / threshold, 1) }`;
            }

            if (glyph !== null)
            {
                // The glyph winds up with the pull right until the work starts, at which point it is the
                // app's standard spinner and a leftover rotation would only fight it.
                glyph.style.transform = phaseRef.current === 'refreshing' ? '' : `rotate(${ offset * 4 }deg)`;
            }
        };

        /**
         * Whether the next paint eases or lands immediately.
         *
         * Set on the elements rather than toggled as a class, because a class is a render and the whole
         * point is that the gesture does not do those. It is also what makes the spring reliable: the
         * old gate was `pull > 0`, which the release falsified in the very commit that moved the content
         * home, so the return never eased — it snapped.
         */
        const ease = (on: boolean) =>
        {
            const badge = indicatorRef.current;

            element.style.transitionProperty = on ? 'transform' : '';
            element.style.transitionDuration = on ? `${ spring }ms` : '';
            element.style.transitionTimingFunction = on ? easing : '';

            if (badge !== null)
            {
                badge.style.transitionProperty = on ? 'height, opacity' : '';
                badge.style.transitionDuration = on ? `${ spring }ms` : '';
                badge.style.transitionTimingFunction = on ? easing : '';
            }
        };

        /**
         * Move now, following the input — no easing, coalesced to one paint per frame.
         */
        const track = (offset: number) =>
        {
            pullRef.current = offset;

            // Short-circuits, so a second event in the same frame updates the target and rides the
            // frame already booked rather than booking another.
            frameRef.current ??= requestAnimationFrame(paint);
        };

        /**
         * Move under the spring's own power, which means painting synchronously: the transition has to
         * see the value change in the same task that turned it on.
         */
        const glide = (offset: number) =>
        {
            if (frameRef.current !== undefined)
            {
                cancelAnimationFrame(frameRef.current);

                frameRef.current = undefined;
            }

            pullRef.current = offset;

            ease(true);
            paint();
        };

        /**
         * Take hold of the pull, from rest or from a spring already in flight.
         *
         * Interrupting one reads the screen and resumes from there, so catching the content on its way
         * back feels like catching it rather than like starting again.
         * @returns {number} The raw travel the gesture is resuming from.
         */
        const begin = () =>
        {
            if (springRef.current !== undefined)
            {
                clearTimeout(springRef.current);

                springRef.current = undefined;
            }

            const carried = phaseRef.current === 'releasing' ? painted(element) : 0;

            phaseRef.current = 'pulling';
            pullRef.current = carried;
            rawRef.current = undamped(carried);

            element.style.willChange = 'transform';

            ease(false);

            // Pins the content where it visually is. Assigning the same value it is mid-flight towards
            // with the duration now at zero is what ends the running transition without a jump.
            paint();

            return rawRef.current;
        };

        /**
         * Nothing is holding the pull any more, so stop paying for the compositor hint and let the
         * classes describe the elements again.
         */
        const rest = () =>
        {
            phaseRef.current = 'idle';
            rawRef.current = 0;

            element.style.willChange = '';

            ease(false);
        };

        /**
         * Send the content home and mark it arrived once it has, the return leg every ending shares.
         */
        const settle = () =>
        {
            phaseRef.current = 'releasing';

            glide(0);

            springRef.current = setTimeout(() =>
            {
                springRef.current = undefined;

                if (phaseRef.current === 'releasing')
                {
                    rest();
                }
            }, spring);
        };

        /**
         * The gesture stopped being ours — the scroller took it.
         */
        const cancel = () =>
        {
            if (settleRef.current !== undefined)
            {
                clearTimeout(settleRef.current);

                settleRef.current = undefined;
            }

            originRef.current = undefined;

            if (pullRef.current > 0)
            {
                settle();
            }
            else
            {
                rest();
            }
        };

        /**
         * What a let-go decides, whichever gesture let go.
         *
         * Shared rather than duplicated because a wheel has no equivalent of `touchend` — it simply
         * stops arriving — so the two gestures differ in when they release, never in what releasing
         * means. Only a live pull can release; a touch that never pulled and a stray timer both land
         * here and both mean nothing.
         */
        const release = () =>
        {
            if (phaseRef.current !== 'pulling')
            {
                return;
            }

            if (settleRef.current !== undefined)
            {
                clearTimeout(settleRef.current);

                settleRef.current = undefined;
            }

            const handler = refreshRef.current;

            if (pullRef.current < threshold || handler === undefined)
            {
                settle();

                return;
            }

            phaseRef.current = 'refreshing';
            rawRef.current = 0;

            setRefreshing(true);

            // Park the indicator at the threshold while the work runs, then let it spring back.
            glide(threshold);

            void Promise.resolve(handler()).finally(() =>
            {
                setRefreshing(false);

                settle();
            });
        };

        const onTouchStart = (event: TouchEvent) =>
        {
            const touch = event.touches[0];

            originRef.current = undefined;

            if (touch === undefined || refreshRef.current === undefined || phaseRef.current === 'refreshing' || element.scrollTop > 0)
            {
                return;
            }

            originRef.current = { y: touch.clientY, seed: begin() };
        };

        const onTouchMove = (event: TouchEvent) =>
        {
            const origin = originRef.current;
            const touch = event.touches[0];

            if (origin === undefined || touch === undefined)
            {
                return;
            }

            // The moment the list is scrolled the gesture belongs to the scroller, not to us.
            if (element.scrollTop > 0)
            {
                cancel();

                return;
            }

            const raw = Math.max(origin.seed + (touch.clientY - origin.y), 0);

            rawRef.current = raw;

            // Without this the WebView rubber-bands the whole page and the pull looks doubled. Only while
            // there is a pull to protect: at zero the scroller is meant to have the gesture back.
            if (raw > 0 && event.cancelable)
            {
                event.preventDefault();
            }

            track(damped(raw));
        };

        const onTouchEnd = () =>
        {
            originRef.current = undefined;

            release();
        };

        /**
         * The same gesture with a wheel or a trackpad, which is what the desktop build has instead.
         *
         * A wheel reports movement rather than position, so the travel accumulates from the deltas rather
         * than being measured against a starting point — scaled down, because a notch is worth far more
         * than the pixels it names, and then damped exactly as the finger is.
         *
         * `wheelScale` is picked against the threshold rather than for its own sake: it is what keeps one
         * notch short of a refresh and two notches past it, which is the count the gesture had before the
         * damping curve replaced the old hard cap.
         *
         * There is no event for letting go of a wheel: it just stops arriving. So the release runs on a
         * short timer that every event pushes back, which is also what keeps trackpad momentum from
         * releasing early in the middle of one flick.
         */
        const onWheel = (event: WheelEvent) =>
        {
            if (refreshRef.current === undefined || phaseRef.current === 'refreshing')
            {
                return;
            }

            // Scrolled away from the top and the gesture belongs to the scroller, the same rule the
            // touch path follows.
            if (element.scrollTop > 0)
            {
                if (phaseRef.current === 'pulling')
                {
                    cancel();
                }

                return;
            }

            // A pull has to be its own gesture, not the tail of the one that arrived here. Scrolling up
            // through a long list throws momentum past the top, and without this that overshoot would
            // accumulate into a refresh nobody asked for — two notches of a stepped wheel is already
            // past the threshold. So a pull only starts from a wheel that has been quiet, and once it
            // has started the rest of the gesture continues it.
            const now = Date.now();
            const idle = now - lastWheelRef.current > settleDelay;

            lastWheelRef.current = now;

            if (phaseRef.current !== 'pulling')
            {
                if (!idle || event.deltaY >= 0)
                {
                    return;
                }

                begin();
            }

            // Down while pulled shortens the pull before it starts scrolling again, so a correction
            // mid-gesture behaves like dragging back up rather than being ignored.
            rawRef.current = Math.max(rawRef.current - event.deltaY / wheelScale, 0);

            track(damped(rawRef.current));

            if (settleRef.current !== undefined)
            {
                clearTimeout(settleRef.current);
            }

            settleRef.current = setTimeout(() =>
            {
                settleRef.current = undefined;

                release();
            }, settleDelay);
        };

        element.addEventListener('touchstart', onTouchStart, { passive: true });
        element.addEventListener('touchmove', onTouchMove, { passive: false });
        element.addEventListener('touchend', onTouchEnd, { passive: true });
        element.addEventListener('touchcancel', onTouchEnd, { passive: true });
        element.addEventListener('wheel', onWheel, { passive: true });

        return () =>
        {
            element.removeEventListener('touchstart', onTouchStart);
            element.removeEventListener('touchmove', onTouchMove);
            element.removeEventListener('touchend', onTouchEnd);
            element.removeEventListener('touchcancel', onTouchEnd);
            element.removeEventListener('wheel', onWheel);

            if (settleRef.current !== undefined)
            {
                clearTimeout(settleRef.current);
            }

            if (springRef.current !== undefined)
            {
                clearTimeout(springRef.current);
            }

            if (frameRef.current !== undefined)
            {
                cancelAnimationFrame(frameRef.current);
            }
        };
    }, [ ]);

    const onScroll = (event: UIEvent<HTMLDivElement>) =>
    {
        const element = event.currentTarget;
        const top = element.scrollTop;
        const delta = top - lastRef.current;

        lastRef.current = top;

        measure();

        onScrollChange?.(top, delta, Math.max(element.scrollHeight - element.clientHeight - top, 0));
    };

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) =>
    {
        const element = viewportRef.current;

        if (element === null)
        {
            return;
        }

        dragRef.current = { origin: event.clientY, top: element.scrollTop };

        event.currentTarget.setPointerCapture(event.pointerId);

        setDragging(true);
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) =>
    {
        const drag = dragRef.current;
        const element = viewportRef.current;

        if (drag === undefined || element === null)
        {
            return;
        }

        const track = element.clientHeight - thumb.size;

        if (track <= 0)
        {
            return;
        }

        element.scrollTop = drag.top + ((event.clientY - drag.origin) / track) * (element.scrollHeight - element.clientHeight);
    };

    const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) =>
    {
        dragRef.current = undefined;

        if (event.currentTarget.hasPointerCapture(event.pointerId))
        {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }

        setDragging(false);
    };

    return (
        <div className={ `relative ${ className }` }>

            { /*
              * Always mounted, and hidden by being nothing tall and nothing opaque. Mounting it on the
              * first movement would mean the frame that starts the pull has nothing to paint into, and
              * unmounting it at zero would cut the spring off half way home.
              */ }
            <div
                ref={ indicatorRef }
                className='pointer-events-none absolute inset-x-0 top-0 z-20 flex h-0 items-center justify-center overflow-hidden opacity-0'>

                <div ref={ glyphRef } className='text-txt-muted'>
                    {
                        refreshing ?
                            <Spinner size={ 18 } /> :
                            <AiOutlineLoading3Quarters size={ 18 } />
                    }
                </div>

            </div>

            <div
                ref={ viewportRef }
                onScroll={ onScroll }
                className='scroll-hidden size-full overflow-y-auto overscroll-contain'>

                {
                    children
                }

            </div>

            {
                thumb.visible &&
                (
                    <div
                        ref={ barRef }
                        onPointerUp={ onPointerUp }
                        onPointerDown={ onPointerDown }
                        onPointerMove={ onPointerMove }
                        onPointerCancel={ onPointerUp }
                        style={ { height: `${ thumb.size }px` } }
                        className={ `absolute inset-e-1 top-0 z-30 w-1.5 cursor-pointer rounded-full bg-txt-muted transition-opacity duration-200 hover:opacity-15 ${ dragging ? 'opacity-100' : 'opacity-5' }` } />
                )
            }

        </div>
    );
}
