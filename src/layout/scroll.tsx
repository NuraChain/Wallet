import { FiLoader } from 'react-icons/fi';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type UIEvent } from 'react';

import Spinner from '../components/ui/spinner';

type Phase = 'idle' | 'pulling' | 'refreshing' | 'releasing';

const threshold = 64;

const limit = threshold * 1.6;

const spring = 320;
const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';

const settleDelay = 140;

const wheelScale = 1.5;

const damped = (distance: number) => limit * (1 - Math.exp(-Math.max(distance, 0) / limit));

const undamped = (offset: number) => -limit * Math.log(1 - Math.min(Math.max(offset, 0) / limit, 0.999));

const painted = (element: HTMLElement) => {
    const { transform } = getComputedStyle(element);

    if (transform === 'none' || transform === '') {
        return 0;
    }

    return new DOMMatrixReadOnly(transform).m42;
};

export default function ScrollArea({
    className = '',
    children,
    onScrollChange,
    onRefresh
}: {
    className?: string;
    children: ReactNode;
    onScrollChange?: (top: number, delta: number, bottom: number) => void;
    onRefresh?: () => Promise<void> | void;
}) {
    const lastRef = useRef(0);
    const barRef = useRef<HTMLDivElement>(null);
    const glyphRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const indicatorRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ origin: number; top: number } | undefined>(undefined);

    const rawRef = useRef(0);
    const pullRef = useRef(0);
    const phaseRef = useRef<Phase>('idle');
    const frameRef = useRef<number | undefined>(undefined);

    const originRef = useRef<{ y: number; seed: number } | undefined>(undefined);
    const refreshRef = useRef(onRefresh);

    const settleRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const springRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const lastWheelRef = useRef(0);

    const [dragging, setDragging] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [thumb, setThumb] = useState({ size: 0, visible: false });

    refreshRef.current = onRefresh;

    const measure = useCallback(() => {
        const element = viewportRef.current;

        if (element === null) {
            return;
        }

        const scrollable = element.scrollHeight - element.clientHeight;

        if (scrollable <= 0) {
            setThumb((current) => (current.visible ? { size: 0, visible: false } : current));

            return;
        }

        const size = Math.max((element.clientHeight / element.scrollHeight) * element.clientHeight, 32);

        setThumb((current) => (current.visible && current.size === size ? current : { size, visible: true }));

        if (barRef.current !== null) {
            barRef.current.style.transform = `translateY(${(element.scrollTop / scrollable) * (element.clientHeight - size)}px)`;
        }
    }, []);

    useEffect(() => {
        const element = viewportRef.current;
        const observer = new ResizeObserver(() => {
            measure();
        });

        if (element !== null) {
            measure();

            observer.observe(element);

            for (const child of element.children) {
                observer.observe(child);
            }
        }

        return () => {
            observer.disconnect();
        };
    }, [measure]);

    useEffect(() => {
        measure();
    }, [measure, thumb.visible]);

    useEffect(() => {
        const element = viewportRef.current;

        if (element === null) {
            return undefined;
        }

        const paint = () => {
            frameRef.current = undefined;

            const offset = pullRef.current;
            const badge = indicatorRef.current;
            const glyph = glyphRef.current;

            element.style.transform = offset === 0 ? '' : `translateY(${offset}px)`;

            if (badge !== null) {
                badge.style.height = offset === 0 ? '' : `${offset}px`;
                badge.style.opacity = offset === 0 ? '' : `${Math.min(offset / threshold, 1)}`;
            }

            if (glyph !== null) {
                glyph.style.transform = phaseRef.current === 'refreshing' ? '' : `rotate(${offset * 4}deg)`;
            }
        };

        const ease = (on: boolean) => {
            const badge = indicatorRef.current;

            element.style.transitionProperty = on ? 'transform' : '';
            element.style.transitionDuration = on ? `${spring}ms` : '';
            element.style.transitionTimingFunction = on ? easing : '';

            if (badge !== null) {
                badge.style.transitionProperty = on ? 'height, opacity' : '';
                badge.style.transitionDuration = on ? `${spring}ms` : '';
                badge.style.transitionTimingFunction = on ? easing : '';
            }
        };

        const track = (offset: number) => {
            pullRef.current = offset;

            frameRef.current ??= requestAnimationFrame(paint);
        };

        const glide = (offset: number) => {
            if (frameRef.current !== undefined) {
                cancelAnimationFrame(frameRef.current);

                frameRef.current = undefined;
            }

            pullRef.current = offset;

            ease(true);
            paint();
        };

        const begin = () => {
            if (springRef.current !== undefined) {
                clearTimeout(springRef.current);

                springRef.current = undefined;
            }

            const carried = phaseRef.current === 'releasing' ? painted(element) : 0;

            phaseRef.current = 'pulling';
            pullRef.current = carried;
            rawRef.current = undamped(carried);

            element.style.willChange = 'transform';

            ease(false);

            paint();

            return rawRef.current;
        };

        const rest = () => {
            phaseRef.current = 'idle';
            rawRef.current = 0;

            element.style.willChange = '';

            ease(false);
        };

        const settle = () => {
            phaseRef.current = 'releasing';

            glide(0);

            springRef.current = setTimeout(() => {
                springRef.current = undefined;

                if (phaseRef.current === 'releasing') {
                    rest();
                }
            }, spring);
        };

        const cancel = () => {
            if (settleRef.current !== undefined) {
                clearTimeout(settleRef.current);

                settleRef.current = undefined;
            }

            originRef.current = undefined;

            if (pullRef.current > 0) {
                settle();
            } else {
                rest();
            }
        };

        const release = () => {
            if (phaseRef.current !== 'pulling') {
                return;
            }

            if (settleRef.current !== undefined) {
                clearTimeout(settleRef.current);

                settleRef.current = undefined;
            }

            const handler = refreshRef.current;

            if (pullRef.current < threshold || handler === undefined) {
                settle();

                return;
            }

            phaseRef.current = 'refreshing';
            rawRef.current = 0;

            setRefreshing(true);

            glide(threshold);

            void Promise.resolve(handler()).finally(() => {
                setRefreshing(false);

                settle();
            });
        };

        const onTouchStart = (event: TouchEvent) => {
            const touch = event.touches[0];

            originRef.current = undefined;

            if (touch === undefined || refreshRef.current === undefined || phaseRef.current === 'refreshing' || element.scrollTop > 0) {
                return;
            }

            originRef.current = { y: touch.clientY, seed: begin() };
        };

        const onTouchMove = (event: TouchEvent) => {
            const origin = originRef.current;
            const touch = event.touches[0];

            if (origin === undefined || touch === undefined) {
                return;
            }

            if (element.scrollTop > 0) {
                cancel();

                return;
            }

            const raw = Math.max(origin.seed + (touch.clientY - origin.y), 0);

            rawRef.current = raw;

            if (raw > 0 && event.cancelable) {
                event.preventDefault();
            }

            track(damped(raw));
        };

        const onTouchEnd = () => {
            originRef.current = undefined;

            release();
        };

        const onWheel = (event: WheelEvent) => {
            if (refreshRef.current === undefined || phaseRef.current === 'refreshing') {
                return;
            }

            if (element.scrollTop > 0) {
                if (phaseRef.current === 'pulling') {
                    cancel();
                }

                return;
            }

            const now = Date.now();
            const idle = now - lastWheelRef.current > settleDelay;

            lastWheelRef.current = now;

            if (phaseRef.current !== 'pulling') {
                if (!idle || event.deltaY >= 0) {
                    return;
                }

                begin();
            }

            rawRef.current = Math.max(rawRef.current - event.deltaY / wheelScale, 0);

            track(damped(rawRef.current));

            if (settleRef.current !== undefined) {
                clearTimeout(settleRef.current);
            }

            settleRef.current = setTimeout(() => {
                settleRef.current = undefined;

                release();
            }, settleDelay);
        };

        element.addEventListener('touchstart', onTouchStart, { passive: true });
        element.addEventListener('touchmove', onTouchMove, { passive: false });
        element.addEventListener('touchend', onTouchEnd, { passive: true });
        element.addEventListener('touchcancel', onTouchEnd, { passive: true });
        element.addEventListener('wheel', onWheel, { passive: true });

        return () => {
            element.removeEventListener('touchstart', onTouchStart);
            element.removeEventListener('touchmove', onTouchMove);
            element.removeEventListener('touchend', onTouchEnd);
            element.removeEventListener('touchcancel', onTouchEnd);
            element.removeEventListener('wheel', onWheel);

            if (settleRef.current !== undefined) {
                clearTimeout(settleRef.current);
            }

            if (springRef.current !== undefined) {
                clearTimeout(springRef.current);
            }

            if (frameRef.current !== undefined) {
                cancelAnimationFrame(frameRef.current);
            }
        };
    }, []);

    const onScroll = (event: UIEvent<HTMLDivElement>) => {
        const element = event.currentTarget;
        const top = element.scrollTop;
        const delta = top - lastRef.current;

        lastRef.current = top;

        measure();

        onScrollChange?.(top, delta, Math.max(element.scrollHeight - element.clientHeight - top, 0));
    };

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

        const track = element.clientHeight - thumb.size;

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

    return (
        <div className={`relative ${className}`}>
            <div
                ref={indicatorRef}
                className='pointer-events-none absolute inset-x-0 top-0 z-10 flex h-0 items-center justify-center overflow-hidden opacity-0'
            >
                <div ref={glyphRef} className='text-txt-muted'>
                    {refreshing ? <Spinner size={18} /> : <FiLoader size={18} />}
                </div>
            </div>

            <div ref={viewportRef} onScroll={onScroll} className='scroll-hidden size-full overflow-y-auto overscroll-contain'>
                {children}
            </div>

            {thumb.visible && (
                <div
                    ref={barRef}
                    onPointerUp={onPointerUp}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerCancel={onPointerUp}
                    style={{ height: `${thumb.size}px` }}
                    className={`absolute inset-e-1 top-0 z-10 w-1.5 cursor-pointer rounded-full bg-scrollbar transition-colors duration-(--duration-base) ${dragging ? 'bg-scrollbar-hover' : 'hover:bg-scrollbar-hover'}`}
                />
            )}
        </div>
    );
}
