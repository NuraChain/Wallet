import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type UIEvent } from 'react';

import Spinner from '../components/ui/spinner';

/**
 * ScrollArea - A scroll container with an overlay scrollbar.
 *
 * The native scrollbar is hidden (`.scroll-hidden`) and replaced by an absolutely positioned thumb, so the bar floats over the content instead of reserving a column of layout width — the content keeps the same width whether it scrolls or not.
 *
 * The thumb rests at 5% opacity and lifts to 15% on hover — the same two weights the native bar's `--scrollbar-thumb` pair carries — so it stays out of the way of the glass surfaces underneath. Only a drag brings it to full, since by then the user is holding it and wants to see what they are moving.
 * @param {object} props Component props.
 * @param {string} [props.className] Extra classes for the outer (positioned) wrapper.
 * @param {ReactNode} props.children The scrollable content.
 * Pulling down while already at the top runs `onRefresh`, the gesture every mobile feed has trained
 * people to expect. The pull is damped and capped so it reads as tension rather than free movement.
 * @param {(top: number, delta: number, bottom: number) => void} [props.onScrollChange] Receives the scroll offset, the signed distance since the previous event, and how much scrollable content is still left below.
 * @param {() => Promise<void> | void} [props.onRefresh] Called when the user pulls past the threshold. Omit to disable the gesture.
 * @returns {JSX.Element} The scroll container.
 */
export default function ScrollArea({ className = '', children, onScrollChange, onRefresh }: { className?: string; children: ReactNode; onScrollChange?: (top: number, delta: number, bottom: number) => void; onRefresh?: () => Promise<void> | void })
{
    const lastRef = useRef(0);
    const viewportRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ origin: number; top: number } | undefined>(undefined);

    const pullRef = useRef(0);
    const originRef = useRef<number | undefined>(undefined);
    const refreshRef = useRef(onRefresh);

    // Whether a wheel gesture is mid-flight, and the timer that decides it has ended. Together they are
    // the wheel's stand-in for `touchstart`/`touchend`, which it has neither of.
    const wheelRef = useRef(false);
    const settleRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // When the last wheel event arrived, which is how a deliberate pull is told from the momentum of
    // the scroll that reached the top.
    const lastWheelRef = useRef(0);

    // Read inside the wheel listener, which is bound once and cannot see the state directly.
    const refreshingRef = useRef(false);

    const [ pull, setPull ] = useState(0);
    const [ dragging, setDragging ] = useState(false);
    const [ refreshing, setRefreshing ] = useState(false);
    const [ thumb, setThumb ] = useState({ size: 0, top: 0, visible: false });

    // Kept in a ref so the touch listeners below can stay bound for the life of the component instead
    // of being torn down and re-attached every time the parent re-renders with a new closure.
    refreshRef.current = onRefresh;

    // Mirrored for the same reason: a wheel fires continuously, so it has to be able to tell that a
    // refresh is already running rather than stacking another one on top of it.
    refreshingRef.current = refreshing;

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
            setThumb({ size: 0, top: 0, visible: false });

            return;
        }

        const size = Math.max((element.clientHeight / element.scrollHeight) * element.clientHeight, 32);

        setThumb({ size, top: (element.scrollTop / scrollable) * (element.clientHeight - size), visible: true });
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

    /**
     * Distance the content travels before a release counts as a refresh.
     */
    const threshold = 64;

    /**
     * How long the wheel has to go quiet before the pull is treated as let go.
     *
     * Long enough to ride out the gap between two notches of a stepped mouse wheel and the tail of a
     * trackpad flick, short enough that the indicator does not hang there after the user has stopped.
     */
    const settleDelay = 140;

    useEffect(() =>
    {
        const element = viewportRef.current;

        if (element === null)
        {
            return undefined;
        }

        const move = (offset: number) =>
        {
            pullRef.current = offset;

            setPull(offset);
        };

        const onTouchStart = (event: TouchEvent) =>
        {
            const touch = event.touches[0];

            originRef.current = element.scrollTop > 0 || touch === undefined ? undefined : touch.clientY;
        };

        const onTouchMove = (event: TouchEvent) =>
        {
            const origin = originRef.current;
            const touch = event.touches[0];

            if (origin === undefined || touch === undefined || refreshRef.current === undefined)
            {
                return;
            }

            // The moment the list is scrolled the gesture belongs to the scroller, not to us.
            if (element.scrollTop > 0)
            {
                originRef.current = undefined;

                move(0);

                return;
            }

            const distance = touch.clientY - origin;

            if (distance <= 0)
            {
                move(0);

                return;
            }

            // Without this the WebView rubber-bands the whole page and the pull looks doubled.
            if (event.cancelable)
            {
                event.preventDefault();
            }

            // Halved, then capped: past the threshold the extra travel shrinks so it feels resistant.
            move(Math.min(distance / 2, threshold * 1.4));
        };

        /**
         * What a let-go decides, whichever gesture let go.
         *
         * Shared rather than duplicated because a wheel has no equivalent of `touchend` — it simply
         * stops arriving — so the two gestures differ in when they release, never in what releasing
         * means.
         */
        const release = () =>
        {
            const distance = pullRef.current;
            const handler = refreshRef.current;

            if (distance < threshold || handler === undefined)
            {
                move(0);

                return;
            }

            // Park the indicator at the threshold while the work runs, then let it spring back.
            move(threshold);

            setRefreshing(true);

            void Promise.resolve(handler()).finally(() =>
            {
                setRefreshing(false);

                move(0);
            });
        };

        const onTouchEnd = () =>
        {
            originRef.current = undefined;

            release();
        };

        /**
         * The same gesture with a wheel or a trackpad, which is what the desktop build has instead.
         *
         * A wheel reports movement rather than position, so the pull accumulates from the deltas rather
         * than being measured against a starting point — halved and capped exactly as the touch path
         * does, so the two feel the same and the indicator travels the same distance.
         *
         * There is no event for letting go of a wheel: it just stops arriving. So the release runs on a
         * short timer that every event pushes back, which is also what keeps trackpad momentum from
         * releasing early in the middle of one flick.
         */
        const onWheel = (event: WheelEvent) =>
        {
            if (refreshRef.current === undefined || refreshingRef.current)
            {
                return;
            }

            // Scrolled away from the top and the gesture belongs to the scroller, the same rule the
            // touch path follows.
            if (element.scrollTop > 0)
            {
                if (pullRef.current > 0)
                {
                    wheelRef.current = false;

                    move(0);
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

            if (pullRef.current === 0 && !idle)
            {
                return;
            }

            // Down while pulled shortens the pull before it starts scrolling again, so a correction
            // mid-gesture behaves like dragging back up rather than being ignored.
            const next = event.deltaY < 0 ?
                Math.min(pullRef.current + -event.deltaY / 2, threshold * 1.4) :
                Math.max(pullRef.current - event.deltaY / 2, 0);

            if (next === 0 && pullRef.current === 0)
            {
                return;
            }

            wheelRef.current = true;

            move(next);

            if (settleRef.current !== undefined)
            {
                clearTimeout(settleRef.current);
            }

            settleRef.current = setTimeout(() =>
            {
                settleRef.current = undefined;

                wheelRef.current = false;

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

            {
                (pull > 0 || refreshing) &&
                (
                    <div
                        style={ { height: `${ pull }px` } }
                        className='pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-center overflow-hidden'>

                        { /*
                          * Before the release the glyph tracks the pull, so it is the plain icon with
                          * a rotation; once the work starts it becomes the app's standard spinner.
                          */ }
                        {
                            refreshing ?
                                <Spinner size={ 18 } className='text-txt-muted' /> :
                                (
                                    <AiOutlineLoading3Quarters
                                        size={ 18 }
                                        style={ { transform: `rotate(${ pull * 4 }deg)` } }
                                        className='text-txt-muted' />
                                )
                        }

                    </div>
                )
            }

            <div
                ref={ viewportRef }
                onScroll={ onScroll }
                style={ { transform: `translateY(${ pull }px)` } }
                className={ `scroll-hidden size-full overflow-y-auto overscroll-contain ${ pull > 0 && originRef.current === undefined && !wheelRef.current ? 'transition-transform duration-300' : '' }` }>

                {
                    children
                }

            </div>

            {
                thumb.visible &&
                (
                    <div
                        onPointerUp={ onPointerUp }
                        onPointerDown={ onPointerDown }
                        onPointerMove={ onPointerMove }
                        onPointerCancel={ onPointerUp }
                        style={ { height: `${ thumb.size }px`, transform: `translateY(${ thumb.top }px)` } }
                        className={ `absolute inset-e-1 top-0 z-30 w-1.5 cursor-pointer rounded-full bg-txt-muted transition-opacity duration-200 hover:opacity-15 ${ dragging ? 'opacity-100' : 'opacity-5' }` } />
                )
            }

        </div>
    );
}
