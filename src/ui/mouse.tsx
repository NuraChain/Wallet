import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Globe } from 'lucide-react';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';

import Logo from '../assets/image/logo.png';

import { cn } from '../utility/cn';
import { focusRing } from './token';
import { layer } from './container';
import { useMouseOpacity } from '../hook/mouse';
import { getMousePosition, readMouseIcon, readMouseOpacity, setMousePosition } from '../core/mouse';

import type { MouseIcon } from '../type/app';

const size = 40;

interface Point {
    x: number;
    y: number;
}

const usePress = ({
    onPress,
    onGrab,
    onStart,
    onDrag
}: {
    onPress: () => void;
    onGrab: (event: PointerEvent<HTMLButtonElement>) => void;
    onStart: () => void;
    onDrag: (event: PointerEvent<HTMLButtonElement>) => void;
}) => {
    const dragRef = useRef<{ id: number; pointer: Point; moved: boolean } | undefined>(undefined);

    const onUp = (event: PointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;

        if (drag?.id !== event.pointerId) {
            return;
        }

        dragRef.current = undefined;

        if (!drag.moved && event.type !== 'pointercancel') {
            onPress();
        }
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

            if (!drag.moved) {
                drag.moved = true;

                onStart();
            }

            onDrag(event);
        },
        onPointerUp: onUp,
        onPointerCancel: onUp,
        // Enter or Space: a click with no pointer, which the pointer handlers never see.
        onClick: (event: MouseEvent<HTMLButtonElement>) => {
            if (event.detail === 0) {
                onPress();
            }
        }
    };
};

function MouseFace({ icon }: { icon: MouseIcon }) {
    if (icon === 'browser') {
        return (
            <span className='pointer-events-none flex size-full items-center justify-center rounded-lg bg-logo-tile text-logo-ink'>
                <Globe size={24} />
            </span>
        );
    }

    return <img src={Logo} alt='' draggable={false} className='pointer-events-none size-full' />;
}

let parked: Point | undefined;

const clamp = ({ x, y }: Point): Point => ({
    x: Math.min(Math.max(x, 0), Math.max(window.innerWidth - size, 0)),
    y: Math.min(Math.max(y, 0), Math.max(window.innerHeight - size, 0))
});

/** It cannot cover a browser tab, so desktop, Android and iOS draw `MouseView` or a native view where they can. */
export default function Mouse({ icon, onPress, onMove }: { icon: MouseIcon; onPress: (at: Point) => void; onMove: () => void }) {
    const opacity = useMouseOpacity();

    const [place, setPlace] = useState(() => clamp(parked ?? { x: (window.innerWidth - size) / 2, y: (window.innerHeight - size) / 2 }));

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
        onPress: () => {
            onPress({ x: place.x + size / 2, y: place.y + size / 2 });
        },
        onGrab: (event) => {
            grabRef.current = { pointer: { x: event.clientX, y: event.clientY }, origin: place };
        },
        onStart: onMove,
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
            <MouseFace icon={icon} />
        </button>,
        target
    );
}

// Physical pixels throughout, so no rounding creeps in between position, size and pointer travel.
const room = async (): Promise<Point> => {
    const inner = await getCurrentWindow().innerSize();

    const self = window.innerWidth * window.devicePixelRatio;

    return { x: Math.max(inner.width - self, 0), y: Math.max(inner.height - self, 0) };
};

const clampPhysical = (point: Point, limit: Point): Point => ({
    x: Math.round(Math.min(Math.max(point.x, 0), limit.x)),
    y: Math.round(Math.min(Math.max(point.y, 0), limit.y))
});

export function MouseView({ opacity: initial, icon: worn }: { opacity: number; icon: MouseIcon }) {
    const [opacity, setOpacity] = useState(initial);
    const [icon, setIcon] = useState(worn);

    const grabRef = useRef<{ screen: Point; start: Promise<[Point, Point]> } | undefined>(undefined);
    const targetRef = useRef<Point | undefined>(undefined);
    const frameRef = useRef(0);

    // The webview is transparent: neither the theme's canvas nor a dark scheme's default may paint.
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
            listen<unknown>('nura://mouse-icon', (event) => {
                setIcon(readMouseIcon(event.payload));
            }),
            getCurrentWindow().onResized(() => {
                void refit().catch(() => undefined);
            })
        ];

        // Sent once listening: whatever the wallet sent while this page was loading reached nobody.
        void Promise.all(stops)
            .then(async () => emit('nura://mouse-ready'))
            .catch(() => undefined);

        return () => {
            for (const stop of stops) {
                void stop.then((unlisten) => {
                    unlisten();
                });
            }
        };
    }, []);

    const press = usePress({
        onPress: () => {
            void emit('nura://mouse', 'click');
        },
        onGrab: (event) => {
            const start = Promise.all([getMousePosition(getCurrentWebview()), room()]);

            start.catch(() => undefined);

            grabRef.current = { screen: { x: event.screenX, y: event.screenY }, start };
        },
        onStart: () => {
            void emit('nura://mouse', 'move');
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
            <MouseFace icon={icon} />
        </button>
    );
}
