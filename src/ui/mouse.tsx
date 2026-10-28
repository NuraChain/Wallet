import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
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
import { SpeedDial, speedReach } from './speeddial';
import { getMousePosition, placeMouse, readMouseIcon, readMouseMenu, readMouseOpacity, setMousePosition } from '../core/mouse';

import type { MouseIcon, MouseMenuItem } from '../type/app';

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

    // The mouse's own side, not the webview's, which is wider while the menu is open round it.
    const self = size * window.devicePixelRatio;

    return { x: Math.max(inner.width - self, 0), y: Math.max(inner.height - self, 0) };
};

const clampPhysical = (point: Point, limit: Point): Point => ({
    x: Math.round(Math.min(Math.max(point.x, 0), limit.x)),
    y: Math.round(Math.min(Math.max(point.y, 0), limit.y))
});

// Kept inside the window when it shrinks: in full screen this is the only way back out.
const refit = async () => {
    const webview = getCurrentWebview();

    const [at, limit] = await Promise.all([getMousePosition(webview), room()]);

    const next = clampPhysical(at, limit);

    if (next.x !== at.x || next.y !== at.y) {
        await setMousePosition(webview, next);
    }
};

interface Menu {
    items: MouseMenuItem[];
    open: boolean;
}

/**
 * The desktop mouse, alone in a webview of its own above the browser. Its menu is drawn here too, by growing the
 * webview round the mouse's centre, so a browser page under it is never covered by the wallet or told to step aside.
 */
export function MouseView({ opacity: initial, icon: worn }: { opacity: number; icon: MouseIcon }) {
    const [opacity, setOpacity] = useState(initial);
    const [icon, setIcon] = useState(worn);
    const [menu, setMenu] = useState<Menu | undefined>(undefined);

    const grabRef = useRef<{ screen: Point; start: Promise<[Point, Point]> } | undefined>(undefined);
    const targetRef = useRef<Point | undefined>(undefined);
    const frameRef = useRef(0);

    // Where the mouse itself stands while the menu is open, in CSS pixels; the webview's corner is then the menu's.
    const homeRef = useRef<Point | undefined>(undefined);

    // The window's size as the menu opened, in physical pixels: only a change from it is a resize the menu must leave for.
    const roomRef = useRef<{ width: number; height: number } | undefined>(undefined);

    // Whether a loss of focus may close the menu yet: taking focus can itself blur the page for an instant on the way.
    const [armed, setArmed] = useState(false);

    // Placements in the order asked, so a drag never lands before the webview has shrunk back to the mouse.
    const placingRef = useRef<Promise<unknown>>(Promise.resolve());

    const place = (task: () => Promise<unknown>) => {
        placingRef.current = placingRef.current.then(task).catch(() => undefined);
    };

    const dismiss = () => {
        setMenu((current) => (current === undefined ? undefined : { ...current, open: false }));
    };

    // Straight back to the mouse's own size where it stands: after the collapse, or at once for a drag or a resize.
    const shrink = () => {
        const home = homeRef.current;

        homeRef.current = undefined;
        roomRef.current = undefined;

        setMenu(undefined);
        setArmed(false);

        if (home !== undefined) {
            place(async () => placeMouse(home.x, home.y));
        }
    };

    // Taken focus, so a press anywhere else, which the webview cannot see, still reaches it as the focus leaving.
    const onMenu = useEffectEvent(async (payload: unknown) => {
        const read = readMouseMenu(payload);

        if (read === undefined || homeRef.current !== undefined) {
            return;
        }

        const webview = getCurrentWebview();
        const ratio = window.devicePixelRatio;

        const [at, inner] = await Promise.all([getMousePosition(webview), getCurrentWindow().innerSize()]);

        // A mouse too near an edge for the ring steps in until it fits, and stays there.
        const fit = (value: number, side: number) => Math.min(Math.max(value, speedReach), Math.max(side - speedReach, speedReach));

        const centre = { x: fit(at.x / ratio + size / 2, inner.width / ratio), y: fit(at.y / ratio + size / 2, inner.height / ratio) };

        const home = { x: centre.x - size / 2, y: centre.y - size / 2 };

        homeRef.current = home;
        roomRef.current = { width: inner.width, height: inner.height };

        document.documentElement.dataset.theme = read.theme;

        setMenu({ items: read.items, open: true });
        setArmed(false);

        place(async () => placeMouse(centre.x - speedReach, centre.y - speedReach, speedReach * 2, speedReach * 2));

        // Armed only once focus has settled here, two frames on, and only for the menu it was taken for. Without the
        // focus there is no way to hear a press elsewhere, so the menu then waits for the mouse, a pick or Escape.
        place(async () => {
            await webview.setFocus();
            await new Promise((resolve) => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(resolve);
                });
            });

            if (homeRef.current === home && document.hasFocus()) {
                setArmed(true);
            }
        });
    });

    const onResize = useEffectEvent((next: { width: number; height: number }) => {
        const opened = roomRef.current;

        // Growing the webview round the mouse is no resize of the window, wherever a platform reports one.
        if (opened !== undefined && opened.width === next.width && opened.height === next.height) {
            return;
        }

        if (homeRef.current !== undefined) {
            shrink();
        }

        place(refit);
    });

    const listening = menu !== undefined && armed;

    useEffect(() => {
        if (!listening) {
            return undefined;
        }

        const onBlur = () => {
            setMenu((current) => (current === undefined ? undefined : { ...current, open: false }));
        };

        window.addEventListener('blur', onBlur);

        return () => {
            window.removeEventListener('blur', onBlur);
        };
    }, [listening]);

    // The webview is transparent: neither the theme's canvas nor a dark scheme's default may paint.
    useLayoutEffect(() => {
        for (const element of [document.documentElement, document.body]) {
            element.style.background = 'transparent';
            element.style.colorScheme = 'normal';
        }
    }, []);

    useEffect(() => {
        const stops = [
            listen<unknown>('nura://mouse-opacity', (event) => {
                setOpacity(readMouseOpacity(event.payload));
            }),
            listen<unknown>('nura://mouse-icon', (event) => {
                setIcon(readMouseIcon(event.payload));
            }),
            listen<unknown>('nura://mouse-menu', (event) => {
                void onMenu(event.payload).catch(() => undefined);
            }),
            getCurrentWindow().onResized((event) => {
                onResize(event.payload);
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
        // A press while the menu is open only closes it.
        onPress: () => {
            if (menu === undefined) {
                void emit('nura://mouse', 'click');
            } else {
                dismiss();
            }
        },
        onGrab: (event) => {
            const home = homeRef.current;
            const ratio = window.devicePixelRatio;

            // While the menu is open the webview's corner is the menu's, so the drag starts from the mouse instead.
            const at = home === undefined ? getMousePosition(getCurrentWebview()) : Promise.resolve({ x: home.x * ratio, y: home.y * ratio });

            const start = Promise.all([at, room()]);

            start.catch(() => undefined);

            grabRef.current = { screen: { x: event.screenX, y: event.screenY }, start };
        },
        onStart: () => {
            void emit('nura://mouse', 'move');

            if (homeRef.current !== undefined) {
                shrink();
            }
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
                                place(async () => setMousePosition(getCurrentWebview(), target));
                            }
                        });
                    }
                },
                () => undefined
            );
        }
    });

    const actions = (menu?.items ?? []).map((item) => ({
        ...item,
        onPick: () => {
            void emit('nura://mouse-pick', item.key);

            dismiss();
        }
    }));

    // The mouse sits in the middle of its webview, which is the mouse's own size or the menu's, so it stays put as one becomes the other.
    return (
        <>
            {menu !== undefined && <SpeedDial actions={actions} at={{ x: speedReach, y: speedReach }} open={menu.open} onDismiss={dismiss} onClosed={shrink} />}

            <button
                type='button'
                {...press}
                style={{ opacity }}
                className={cn('fixed inset-0 m-auto size-10 cursor-grab touch-none select-none active:cursor-grabbing', layer.mouse)}
            >
                <MouseFace icon={icon} />
            </button>
        </>
    );
}
