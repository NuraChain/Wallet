import { useRef, type ReactNode } from 'react';

import { motion } from 'motion/react';
import { IoClose } from 'react-icons/io5';

import Text from './text';
import Button from './button';

import { T } from '../../utility/language';

import { cn } from '../../utility/cn';
import { DialogTitleContext, useDialog, useDialogTitleId } from './dialog';
import ScrollBar from './scrollbar';
import { surfacePanel } from './panel';
import { Horizontal, Vertical } from './stack';
import { inset, layer } from '../../layout/container';

export function Modal({
    onClose,
    scroll = false,
    scale = 0.9,
    panelClass = '',
    children
}: {
    onClose: () => void;
    scroll?: boolean;
    scale?: number;
    panelClass?: string;
    children: ReactNode;
}) {
    const { panelRef, titleId } = useDialog(onClose);

    const panel = (
        <motion.div
            ref={panelRef}
            role='dialog'
            aria-modal
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, scale }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale }}
            className={cn(
                surfacePanel,
                'pointer-events-auto flex w-80 max-w-full flex-col gap-3 rounded-dialog p-5 shadow-float outline-none',
                scroll && 'max-h-full overflow-y-auto',
                panelClass
            )}
        >
            <DialogTitleContext value={titleId}>{children}</DialogTitleContext>
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

                        <ScrollBar viewportRef={panelRef} className='-inset-e-0.5 top-2' />
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
    closeLabel = '',
    titleClass = '',
    groupClass = '',
    className = '',
    onClose
}: {
    title: string;
    subtitle?: string;
    leading?: ReactNode;
    close?: 'icon' | 'chip';
    closeLabel?: string;
    titleClass?: string;
    groupClass?: string;
    className?: string;
    onClose: () => void;
}) {
    const titleId = useDialogTitleId();

    const heading = <Text as='h2' id={titleId} variant='title' className={cn('min-w-0', titleClass)} text={title} />;

    return (
        <Horizontal className={cn('shrink-0 items-center justify-between gap-3', className)}>
            {subtitle.length === 0 && leading === undefined ? (
                heading
            ) : (
                <Horizontal className={cn(leading === undefined ? 'min-w-0 flex-col' : 'min-w-0 items-center gap-2', groupClass)}>
                    {leading}

                    {heading}

                    {subtitle.length > 0 && <Text text={subtitle} />}
                </Horizontal>
            )}

            <Button
                variant={close === 'chip' ? 'chip' : 'muted'}
                size={close === 'chip' ? 'iconChip' : 'icon'}
                aria-label={closeLabel.length > 0 ? closeLabel : T('App.Close')}
                onClick={onClose}
                className='shrink-0'
            >
                <IoClose size={20} />
            </Button>
        </Horizontal>
    );
}

export function ModalBody({ className = '', children }: { className?: string; children: ReactNode }) {
    const viewportRef = useRef<HTMLDivElement>(null);

    return (
        <Vertical className='relative -m-3 min-h-0 flex-1'>
            <Vertical ref={viewportRef} className={cn('min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain p-3 *:shrink-0', className)}>
                {children}
            </Vertical>

            <ScrollBar viewportRef={viewportRef} className='-inset-e-0.5' />
        </Vertical>
    );
}

export function ModalActions({ className = '', children }: { className?: string; children: ReactNode }) {
    return <Horizontal className={cn('mt-1 shrink-0 gap-2 *:flex-1', className)}>{children}</Horizontal>;
}
