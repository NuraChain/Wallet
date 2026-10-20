import { useRef, type ReactNode } from 'react';

import { motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';

import Text from './text';
import Button from './button';

import { cn } from '../utility/cn';
import { useDialog } from './dialog';
import ScrollBar from './scrollbar';
import { surfacePanel } from './panel';
import { Horizontal, Vertical } from './stack';
import { inset, layer } from './container';
import { blur, scale as motionScale, spring, transition } from './motion';

const widthMap = {
    panel: 'w-80 sm:w-96 lg:w-112',
    narrow: 'w-72 sm:w-80',
    full: 'size-full'
} as const;

export function Modal({
    onClose,
    scroll = false,
    scale = motionScale.dialog,
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
    padding?: 'none';
    gap?: 2;
    align?: 'center';
    children: ReactNode;
}) {
    const { panelRef } = useDialog(onClose);

    const reduced = useReducedMotion() === true;
    const upright = width === 'full' ? 'scale(1)' : 'perspective(500px) rotateX(0deg) scale(1)';
    const tilt = width === 'full' ? '' : 'perspective(500px) rotateX(-20deg) ';
    const tipped = reduced ? upright : `${tilt}scale(${scale})`;

    const panel = (
        <motion.div
            ref={panelRef}
            role='dialog'
            tabIndex={-1}
            initial={{ opacity: 0, filter: blur.surface, transform: tipped }}
            animate={{
                opacity: 1,
                filter: 'blur(0px)',
                transform: upright,
                transition: { ...spring.dialog, opacity: transition.dialogFade },
                transitionEnd: { filter: 'none', transform: 'none' }
            }}
            exit={{ opacity: 0, filter: ['blur(0px)', blur.surface], transform: [upright, tipped], transition: transition.dismiss }}
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
                transition={transition.overlay}
                className={cn('absolute size-full cursor-pointer bg-scrim', layer.dialog)}
                onClick={onClose}
            />

            {/* Spans the app so `max-h-full` has a definite height; a viewport unit misread it on macOS WebKit. */}
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
    action,
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
    action?: ReactNode;
    close?: 'icon' | 'chip' | 'none';
    truncate?: boolean;
    titleSize?: 'large';
    titleGrow?: boolean;
    width?: 'full';
    onClose: () => void;
}) {
    const Group = leading === undefined ? Vertical : Horizontal;

    const heading = <Text as='h2' variant='title' squeeze='x' size={titleSize} truncate={truncate} text={title} />;

    const closer = close !== 'none' && (
        <Button
            variant={close === 'chip' ? 'chip' : 'muted'}
            size={close === 'chip' ? 'iconChip' : 'icon'}
            onClick={onClose}
            shrink={false}
            icon={<X size={20} />}
        />
    );

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

            {action === undefined ? (
                closer
            ) : (
                <Horizontal shrink={false} align='center' gap={2}>
                    {action}

                    {closer}
                </Horizontal>
            )}
        </Horizontal>
    );
}

export function ModalBody({ gap = 3, short = false, mt, children }: { gap?: 2 | 3; short?: boolean; mt?: 2; children: ReactNode }) {
    const viewportRef = useRef<HTMLDivElement>(null);

    // Pulled out by the viewport's padding so a focus ring on the first or last row is not clipped.
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
