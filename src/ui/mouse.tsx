import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';

import Logo from '../assets/image/logo.png';

import { cn } from '../utility/cn';
import { focusRing } from './token';
import { layer } from './container';
import { useMouseOpacity } from '../hook/mouse';
import { getMousePosition, readMouseOpacity, setMousePosition } from '../core/mouse';

import type { MouseAction } from '../type/app';

const size = 40;
const edge = 16;

/** A second press inside this long is a double click, so a single one waits this long to be sure. */
const doubleWindow = 250;

interface Point {
    x: number;
    y: number;
}

/**
 * Tells a press from a double press from a drag. Where the drag goes is the caller's: `onGrab`
 * sees the press that starts one, `onDrag` every move once it has travelled far enough to count.
 */
const usePress = ({
    onAction,
    onGrab,
    onDrag
}: {
    onAction: (action: MouseAction) => void;
    onGrab: (event: PointerEvent<HTMLButtonElement>) => void;
    onDrag: (event: PointerEvent<HTMLButtonElement>) => void;
}) => {
    const dragRef = useRef<{ id: number; pointer: Point; moved: boolean } | undefined>(undefined);
    const pendingRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(
        () => () => {
            clearTimeout(pendingRef.current);
        },
        []
    );

    const onUp = (event: PointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;

        if (drag?.id !== event.pointerId) {
            return;
        }

        dragRef.current = undefined;

        if (drag.moved || event.type === 'pointercancel') {
            return;
        }

        if (pendingRef.current !== undefined) {
            clearTimeout(pendingRef.current);

            pendingRef.current = undefined;

            onAction('double');

            return;
        }

        pendingRef.current = setTimeout(() => {
            pendingRef.current = undefined;

            onAction('click');
        }, doubleWindow);
    };

    return {
        onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
            event.currentTarget.setPointerCapture(event.pointerId);

            dragRef.current = { id: event.pointerId, pointer: { x: event.clientX, y: event.clientY }, moved: false };

            onGrab(event);
        },
        onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
            const drag = dragRef.current;

            if (drag?.id !== event.pointerId) {
                return;
            }

            if (!drag.moved && Math.hypot(event.clientX - drag.pointer.x, event.clientY - drag.pointer.y) < 4) {
                return;
            }

            drag.moved = true;

            onDrag(event);
        },
        onPointerUp: onUp,
        onPointerCancel: onUp,
        // Enter or Space: a click with no pointer behind it, which the pointer handlers never see.
        onClick: (event: MouseEvent<HTMLButtonElement>) => {
            if (event.detail === 0) {
                onAction('click');
            }
        }
    };
};

// Where it was left, so a lock and unlock put it back rather than in the corner.
let parked: Point | undefined;

// Kept inside the window, however far it is dragged or however small the window gets.
const clamp = ({ x, y }: Point): Point => ({
    x: Math.min(Math.max(x, 0), Math.max(window.innerWidth - size, 0)),
    y: Math.min(Math.max(y, 0), Math.max(window.innerHeight - size, 0))
});

/**
 * The floating mouse drawn in the page itself: the app's logo, dragged anywhere across the window
 * and pressed to move around the wallet. One element in the page's own `#mouse`, above everything
 * the wallet draws — but not above a browser tab, which is why desktop and Android draw
 * `MouseView` or a native view instead where they can. It only reports what happened; the
 * dashboard decides what a press means.
 */
export default function Mouse({ onAction }: { onAction: (action: MouseAction) => void }) {
    const opacity = useMouseOpacity();

    const [place, setPlace] = useState(() => clamp(parked ?? { x: window.innerWidth - size - edge, y: window.innerHeight * 0.7 }));

    const grabRef = useRef<{ pointer: Point; origin: Point } | undefined>(undefined);

    useEffect(() => {
        parked = place;
    }, [place]);

    useEffect(() => {
        const onResize = () => {
            setPlace((current) => clamp(current));
        };

        window.addEventListener('resize', onResize);

        return () => {
            window.removeEventListener('resize', onResize);
        };
    }, []);

    const press = usePress({
        onAction,
        onGrab: (event) => {
            grabRef.current = { pointer: { x: event.clientX, y: event.clientY }, origin: place };
        },
        onDrag: (event) => {
            const grab = grabRef.current;

            if (grab !== undefined) {
                setPlace(clamp({ x: grab.origin.x + event.clientX - grab.pointer.x, y: grab.origin.y + event.clientY - grab.pointer.y }));
            }
        }
    });

    const target = document.querySelector('#mouse');

    if (target === null) {
        return undefined;
    }

    return createPortal(
        <button
            type='button'
            {...press}
            style={{ left: place.x, top: place.y, opacity }}
            className={cn(focusRing, 'absolute size-10 cursor-grab touch-none select-none active:cursor-grabbing', layer.mouse)}
        >
            <img src={Logo} alt='' draggable={false} className='pointer-events-none size-full' />
        </button>,
        target
    );
}

// Physical pixels throughout: the webview's own position, the window's size, and the pointer's
// travel scaled up from CSS pixels, so no rounding creeps in between them.
const room = async (): Promise<Point> => {
    const inner = await getCurrentWindow().innerSize();

    const self = window.innerWidth * window.devicePixelRatio;

    return { x: Math.max(inner.width - self, 0), y: Math.max(inner.height - self, 0) };
};

const clampPhysical = (point: Point, limit: Point): Point => ({
    x: Math.round(Math.min(Math.max(point.x, 0), limit.x)),
    y: Math.round(Math.min(Math.max(point.y, 0), limit.y))
});

/**
 * The desktop mouse: the whole of a small transparent webview stacked over the wallet and its
 * browser tabs, so it moves by moving that webview, and says what happened by event.
 */
export function MouseView({ opacity: initial }: { opacity: number }) {
    const [opacity, setOpacity] = useState(initial);

    const grabRef = useRef<{ screen: Point; start: Promise<[Point, Point]> } | undefined>(undefined);
    const targetRef = useRef<Point | undefined>(undefined);
    const frameRef = useRef(0);

    // The webview is transparent, so nothing may paint around the logo: not the theme's canvas,
    // and not a dark color scheme's default one either.
    useLayoutEffect(() => {
        for (const element of [document.documentElement, document.body]) {
            element.style.background = 'transparent';
            element.style.colorScheme = 'normal';
        }
    }, []);

    useEffect(() => {
        const webview = getCurrentWebview();

        // Kept inside the window when it shrinks: in full screen this is the only way back out.
        const refit = async () => {
            const [at, limit] = await Promise.all([getMousePosition(webview), room()]);

            const next = clampPhysical(at, limit);

            if (next.x !== at.x || next.y !== at.y) {
                await setMousePosition(webview, next);
            }
        };

        const stops = [
            listen<unknown>('nura://mouse-opacity', (event) => {
                setOpacity(readMouseOpacity(event.payload));
            }),
            getCurrentWindow().onResized(() => {
                void refit().catch(() => undefined);
            })
        ];

        return () => {
            for (const stop of stops) {
                void stop.then((unlisten) => {
                    unlisten();
                });
            }
        };
    }, []);

    const press = usePress({
        onAction: (action) => {
            void emit('nura://mouse', action);
        },
        onGrab: (event) => {
            const start = Promise.all([getMousePosition(getCurrentWebview()), room()]);

            start.catch(() => undefined);

            grabRef.current = { screen: { x: event.screenX, y: event.screenY }, start };
        },
        // Screen coordinates, since the page moves with the webview and its own would move too.
        onDrag: (event) => {
            const grab = grabRef.current;

            if (grab === undefined) {
                return;
            }

            const dx = (event.screenX - grab.screen.x) * window.devicePixelRatio;
            const dy = (event.screenY - grab.screen.y) * window.devicePixelRatio;

            void grab.start.then(
                ([at, limit]) => {
                    targetRef.current = clampPhysical({ x: at.x + dx, y: at.y + dy }, limit);

                    // One move per frame, always to the latest point, however fast the pointer reports.
                    if (frameRef.current === 0) {
                        frameRef.current = requestAnimationFrame(() => {
                            frameRef.current = 0;

                            const target = targetRef.current;

                            if (target !== undefined) {
                                void setMousePosition(getCurrentWebview(), target).catch(() => undefined);
                            }
                        });
                    }
                },
                () => undefined
            );
        }
    });

    return (
        <button type='button' {...press} style={{ opacity }} className='fixed inset-0 cursor-grab touch-none select-none active:cursor-grabbing'>
            <img src={Logo} alt='' draggable={false} className='pointer-events-none size-full' />
        </button>
    );
}
