import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type UIEvent } from 'react';

/**
 * ScrollArea - A scroll container with an overlay scrollbar.
 *
 * The native scrollbar is hidden (`.scroll-hidden`) and replaced by an absolutely positioned thumb, so the bar floats over the content instead of reserving a column of layout width — the content keeps the same width whether it scrolls or not.
 *
 * The thumb rests at 30% opacity and only reaches full opacity while hovered or dragged, so it stays out of the way of the glass surfaces underneath.
 * @param {object} props Component props.
 * @param {string} [props.className] Extra classes for the outer (positioned) wrapper.
 * @param {ReactNode} props.children The scrollable content.
 * @param {(top: number, delta: number) => void} [props.onScrollChange] Receives the scroll offset and the signed distance since the previous event.
 * @returns {JSX.Element} The scroll container.
 */
export default function ScrollArea({ className = '', children, onScrollChange }: { className?: string; children: ReactNode; onScrollChange?: (top: number, delta: number) => void })
{
    const lastRef = useRef(0);
    const viewportRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ origin: number; top: number } | undefined>(undefined);

    const [ dragging, setDragging ] = useState(false);
    const [ thumb, setThumb ] = useState({ size: 0, top: 0, visible: false });

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

    const onScroll = (event: UIEvent<HTMLDivElement>) =>
    {
        const top = event.currentTarget.scrollTop;
        const delta = top - lastRef.current;

        lastRef.current = top;

        measure();

        onScrollChange?.(top, delta);
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
                        onPointerUp={ onPointerUp }
                        onPointerDown={ onPointerDown }
                        onPointerMove={ onPointerMove }
                        onPointerCancel={ onPointerUp }
                        style={ { height: `${ thumb.size }px`, transform: `translateY(${ thumb.top }px)` } }
                        className={ `absolute inset-e-1 top-0 z-30 w-1.5 cursor-pointer rounded-full bg-txt-muted transition-opacity duration-200 hover:opacity-100 ${ dragging ? 'opacity-100' : 'opacity-30' }` } />
                )
            }

        </div>
    );
}
