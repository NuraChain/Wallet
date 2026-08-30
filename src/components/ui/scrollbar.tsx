import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

import { cn } from '../../utility/cn';

const minSize = 32;

export default function ScrollBar({ viewportRef, className = '' }: { viewportRef: RefObject<HTMLElement | null>; className?: string }) {
    const barRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ origin: number; top: number } | undefined>(undefined);

    const [size, setSize] = useState(0);
    const [dragging, setDragging] = useState(false);

    const measure = useCallback(() => {
        const element = viewportRef.current;

        if (element === null) {
            return;
        }

        const scrollable = element.scrollHeight - element.clientHeight;

        if (scrollable <= 0) {
            setSize(0);

            return;
        }

        const next = Math.max((element.clientHeight / element.scrollHeight) * element.clientHeight, minSize);

        setSize((current) => (current === next ? current : next));

        if (barRef.current !== null) {
            barRef.current.style.transform = `translateY(${(element.scrollTop / scrollable) * (element.clientHeight - next)}px)`;
        }
    }, [viewportRef]);

    useEffect(() => {
        const element = viewportRef.current;

        if (element === null) {
            return undefined;
        }

        const observer = new ResizeObserver(() => {
            measure();
        });

        const watch = () => {
            observer.disconnect();
            observer.observe(element);

            for (const child of element.children) {
                observer.observe(child);
            }

            measure();
        };

        const mutations = new MutationObserver(watch);

        watch();

        mutations.observe(element, { childList: true });

        element.addEventListener('scroll', measure, { passive: true });

        return () => {
            observer.disconnect();
            mutations.disconnect();

            element.removeEventListener('scroll', measure);
        };
    }, [measure, viewportRef]);

    useEffect(() => {
        measure();
    }, [measure, size]);

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        const element = viewportRef.current;

        if (element === null) {
            return;
        }

        dragRef.current = { origin: event.clientY, top: element.scrollTop };

        event.currentTarget.setPointerCapture(event.pointerId);

        setDragging(true);
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        const element = viewportRef.current;

        if (drag === undefined || element === null) {
            return;
        }

        const track = element.clientHeight - size;

        if (track <= 0) {
            return;
        }

        element.scrollTop = drag.top + ((event.clientY - drag.origin) / track) * (element.scrollHeight - element.clientHeight);
    };

    const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        dragRef.current = undefined;

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }

        setDragging(false);
    };

    if (size === 0) {
        return undefined;
    }

    return (
        <div
            ref={barRef}
            onPointerUp={onPointerUp}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerCancel={onPointerUp}
            style={{ height: `${size}px` }}
            className={cn(
                'absolute inset-e-1 top-0 z-10 w-1.5 cursor-pointer rounded-full bg-scrollbar opacity-50 transition-opacity duration-(--duration-base) hover:opacity-100',
                dragging && 'opacity-100',
                className
            )}
        />
    );
}
