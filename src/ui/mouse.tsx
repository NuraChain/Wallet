import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';

import Logo from '../assets/image/logo.png';

import { cn } from '../utility/cn';
import { focusRing } from './token';
import { layer } from './container';
import { useMouseOpacity } from '../hook/mouse';

import type { MouseAction } from '../type/app';

const size = 48;
const edge = 16;

/** A second press inside this long is a double click, so a single one waits this long to be sure. */
const doubleWindow = 250;

interface Point {
    x: number;
    y: number;
}

// Where it was left, so a lock and unlock put it back rather than in the corner.
let parked: Point | undefined;

// Kept inside the window, however far it is dragged or however small the window gets.
const clamp = ({ x, y }: Point): Point => ({
    x: Math.min(Math.max(x, 0), Math.max(window.innerWidth - size, 0)),
    y: Math.min(Math.max(y, 0), Math.max(window.innerHeight - size, 0))
});

/**
 * The floating mouse: the app's logo, dragged anywhere across the window and pressed to move
 * around the wallet. One element in the page's own `#mouse`, above everything the wallet draws.
 * It only reports what happened; the dashboard decides what a press means.
 */
export default function Mouse({ onAction }: { onAction: (action: MouseAction) => void }) {
    const opacity = useMouseOpacity();

    const [place, setPlace] = useState(() => clamp(parked ?? { x: window.innerWidth - size - edge, y: window.innerHeight * 0.7 }));

    const dragRef = useRef<{ id: number; pointer: Point; origin: Point; moved: boolean } | undefined>(undefined);
    const pendingRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

            clearTimeout(pendingRef.current);
        };
    }, []);

    const onDown = (event: PointerEvent<HTMLButtonElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);

        dragRef.current = { id: event.pointerId, pointer: { x: event.clientX, y: event.clientY }, origin: place, moved: false };
    };

    const onMove = (event: PointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;

        if (drag?.id !== event.pointerId) {
            return;
        }

        const dx = event.clientX - drag.pointer.x;
        const dy = event.clientY - drag.pointer.y;

        if (!drag.moved && Math.hypot(dx, dy) < 4) {
            return;
        }

        drag.moved = true;

        setPlace(clamp({ x: drag.origin.x + dx, y: drag.origin.y + dy }));
    };

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

    const target = document.querySelector('#mouse');

    if (target === null) {
        return undefined;
    }

    return createPortal(
        <button
            type='button'
            aria-label='Nura Wallet'
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            style={{ left: place.x, top: place.y, opacity }}
            className={cn(focusRing, 'absolute size-12 cursor-grab touch-none select-none active:cursor-grabbing', layer.mouse)}
        >
            <img src={Logo} alt='' draggable={false} className='pointer-events-none size-full' />
        </button>,
        target
    );
}
