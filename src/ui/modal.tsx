import { useRef, type ReactNode } from 'react';

import { motion } from 'motion/react';
import { X } from 'lucide-react';

import Text from './text';
import Button from './button';

import { cn } from '../utility/cn';
import { useDialog } from './dialog';
import ScrollBar from './scrollbar';
import { surfacePanel } from './panel';
import { Horizontal, Vertical } from './stack';
import { inset, layer } from './container';

/* The window is 360 wide, but the app lays out for a desktop too — a sidebar at `lg`, a wider
   page container — and every dialog stayed a 320px column on all of it. That width is what made
   a recovery word clip and an address need truncating, so it grows with the window now. Callers
   pick a step rather than passing a width, so nothing has to out-specify a breakpoint here. */
const widthMap = {
    panel: 'w-80 sm:w-96 lg:w-112',
    narrow: 'w-72 sm:w-80',
    full: 'size-full'
} as const;

export function Modal({
    onClose,
    scroll = false,
    scale = 0.9,
    width = 'panel',
    padding,
    gap,
    align,
    children
}: {
    onClose: () => void;
    scroll?: boolean;
    scale?: number;
    width?: keyof typeof widthMap;
    /** `none` for a full-screen dialog whose sections run to its edges. */
    padding?: 'none';
    /** A tighter rhythm than the default, for a dialog that is mostly a list. */
    gap?: 2;
    align?: 'center';
    children: ReactNode;
}) {
    const { panelRef } = useDialog(onClose);

    const panel = (
        <motion.div
            ref={panelRef}
            role='dialog'
            tabIndex={-1}
            initial={{ opacity: 0, scale }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale }}
            className={cn(
                surfacePanel,
                'pointer-events-auto flex max-w-full flex-col gap-3 rounded-dialog p-5 shadow-float outline-none',
                widthMap[width],
                scroll && 'max-h-full overflow-y-auto',
                padding === 'none' && 'p-0',
                gap === 2 && 'gap-2',
                align === 'center' && 'items-center'
            )}
        >
            {children}
        </motion.div>
    );

    return (
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn('absolute size-full cursor-pointer bg-scrim', layer.dialog)}
                onClick={onClose}
            />

            {/* The frame spans the whole app, so the panel's `max-h-full` measures against a height
                that is definite on every engine — a viewport unit read the window wrong under macOS
                WebKit and left the taller modals overflowing. It passes clicks through to the scrim
                underneath rather than swallowing the ones that land beside the panel. */}
            <div className={cn('pointer-events-none absolute inset-0 flex items-center justify-center p-4', inset.modalFrame, layer.dialog)}>
                {scroll ? (
                    <div className='pointer-events-auto relative flex max-h-full min-h-0'>
                        {panel}

                        <ScrollBar viewportRef={panelRef} edge='flushTop' />
                    </div>
                ) : (
                    panel
                )}
            </div>
        </>
    );
}

export function ModalHeader({
    title,
    subtitle = '',
    leading,
    close = 'icon',
    truncate = false,
    titleSize,
    titleGrow = false,
    width,
    onClose
}: {
    title: string;
    subtitle?: string;
    leading?: ReactNode;
    close?: 'icon' | 'chip' | 'none';
    /** Cuts a long title to one line. */
    truncate?: boolean;
    titleSize?: 'large';
    /** The title and subtitle take the width the close button leaves. */
    titleGrow?: boolean;
    width?: 'full';
    onClose: () => void;
}) {
    // With nothing leading, the title and its subtitle stack; with an icon, they sit beside it.
    const Group = leading === undefined ? Vertical : Horizontal;

    const heading = <Text as='h2' variant='title' squeeze='x' size={titleSize} truncate={truncate} text={title} />;

    return (
        <Horizontal shrink={false} align='center' justify='between' gap={3} width={width}>
            {subtitle.length === 0 && leading === undefined ? (
                heading
            ) : (
                <Group squeeze='x' align={leading === undefined ? undefined : 'center'} gap={leading === undefined ? undefined : 2} grow={titleGrow}>
                    {leading}

                    {heading}

                    {subtitle.length > 0 && <Text text={subtitle} />}
                </Group>
            )}

            {/* A step that must not be abandoned halfway — a transaction already in flight — asks
                for `none`, so the header offers no way out that the surface itself refuses. */}
            {close !== 'none' && (
                <Button
                    variant={close === 'chip' ? 'chip' : 'muted'}
                    size={close === 'chip' ? 'iconChip' : 'icon'}
                    onClick={onClose}
                    shrink={false}
                    icon={<X size={20} />}
                />
            )}
        </Horizontal>
    );
}

export function ModalBody({
    gap = 3,
    short = false,
    mt,
    children
}: {
    gap?: 2 | 3;
    /** Held to a short height, for a list that should not fill the window. */
    short?: boolean;
    mt?: 2;
    children: ReactNode;
}) {
    const viewportRef = useRef<HTMLDivElement>(null);

    // The frame pulls out by the viewport's padding, so the rows scroll edge to edge and a focus
    // ring on the first or last of them is not clipped.
    return (
        <div className='relative -m-3 flex min-h-0 flex-1 flex-col'>
            <div
                ref={viewportRef}
                className={cn(
                    'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-3 *:shrink-0',
                    gap === 2 ? 'gap-2' : 'gap-3',
                    mt === 2 && 'mt-2',
                    short && 'max-h-72'
                )}
            >
                {children}
            </div>

            <ScrollBar viewportRef={viewportRef} edge='flush' />
        </div>
    );
}

export function ModalActions({ flush = false, children }: { flush?: boolean; children: ReactNode }) {
    return (
        <Horizontal mt={flush ? 0 : 1} shrink={false} gap={2} even>
            {children}
        </Horizontal>
    );
}
