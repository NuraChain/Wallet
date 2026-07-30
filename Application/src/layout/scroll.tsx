import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type UIEvent } from 'react';

/**
 * ScrollArea - A scroll container with an overlay scrollbar.
 *
 * The native scrollbar is hidden (`.scroll-hidden`) and replaced by an absolutely positioned thumb, so the bar floats over the content instead of reserving a column of layout width — the content keeps the same width whether it scrolls or not.
 *
 * The thumb rests at 10% opacity and only reaches full opacity while hovered or dragged, so it stays out of the way of the glass surfaces underneath.
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

    const [ pull, setPull ] = useState(0);
    const [ dragging, setDragging ] = useState(false);
    const [ refreshing, setRefreshing ] = useState(false);
    const [ thumb, setThumb ] = useState({ size: 0, top: 0, visible: false });

    // Kept in a ref so the touch listeners below can stay bound for the life of the component instead
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

        const onTouchEnd = () =>
        {
            const distance = pullRef.current;
            const handler = refreshRef.current;

            originRef.current = undefined;

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

        element.addEventListener('touchstart', onTouchStart, { passive: true });
        element.addEventListener('touchmove', onTouchMove, { passive: false });
        element.addEventListener('touchend', onTouchEnd, { passive: true });
        element.addEventListener('touchcancel', onTouchEnd, { passive: true });

        return () =>
        {
            element.removeEventListener('touchstart', onTouchStart);
            element.removeEventListener('touchmove', onTouchMove);
            element.removeEventListener('touchend', onTouchEnd);
            element.removeEventListener('touchcancel', onTouchEnd);
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

                        <AiOutlineLoading3Quarters
                            size={ 18 }
                            style={ refreshing ? undefined : { transform: `rotate(${ pull * 4 }deg)` } }
                            className={ `text-txt-muted ${ refreshing ? 'animate-spin' : '' }` } />

                    </div>
                )
            }

            <div
                ref={ viewportRef }
                onScroll={ onScroll }
                style={ { transform: `translateY(${ pull }px)` } }
                className={ `scroll-hidden size-full overflow-y-auto overscroll-contain ${ pull > 0 && originRef.current === undefined ? 'transition-transform duration-300' : '' }` }>

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
                        className={ `bg-txt-muted absolute inset-e-1 top-0 z-30 w-1.5 cursor-pointer rounded-full transition-opacity duration-200 hover:opacity-100 ${ dragging ? 'opacity-100' : 'opacity-10' }` } />
                )
            }

        </div>
    );
}
