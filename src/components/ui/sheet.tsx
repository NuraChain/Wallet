import type { ReactNode } from 'react';

import { motion } from 'motion/react';
import { IoClose } from 'react-icons/io5';

import Text from './text';
import Button from './button';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { inset, layer } from '../../layout/container';
import { DialogTitleContext, useDialog, useDialogTitleId } from './dialog';
import { surfacePanel } from './panel';
import { Vertical } from './stack';

/**
 * Sheet - The top drop-down glass sheet the intro flows open.
 *
 * Slides in from above the window, keeps itself inside the top safe area, and caps its width so it
 * reads as a card on wide screens. The identical structure lived in both intro sub-pages; the close
 * control and motion belong to the sheet, the content below it to the caller.
 * @param {object} props Component props.
 * @param {() => void} props.onClose Called by the close button and the backdrop.
 * @param {ReactNode} props.children The sheet content.
 * @returns {JSX.Element} The sheet.
 */
export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
    const { panelRef, titleId } = useDialog(onClose);

    return (
        <>
            {/* Full-viewport and animated, so never filtered — see the note on the scrim in modal.tsx. */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`absolute size-full cursor-pointer bg-scrim ${layer.dialog}`}
                onClick={onClose}
            />

            {/*
             * The sheet shares the modal's layer rather than sitting one below it. They are the same
             * kind of surface and only one is ever open, so putting them on different layers only
             * created the possibility of them disagreeing about which covers the chrome.
             */}
            <motion.div
                ref={panelRef}
                role='dialog'
                aria-modal
                aria-labelledby={titleId}
                tabIndex={-1}
                initial={{ y: '-100%' }}
                animate={{ y: '0%' }}
                exit={{ y: '-100%' }}
                transition={{ type: 'tween' }}
                className={cn(
                    surfacePanel,
                    layer.dialog,
                    'absolute inset-x-0 top-0 mx-2 flex h-fit max-h-full max-w-lg flex-col gap-2 overflow-y-auto overscroll-contain rounded-b-dialog px-4 shadow-float outline-none',
                    inset.sheetTop,
                    'pb-4 sm:mx-auto sm:px-6 sm:pb-6'
                )}
            >
                <Button variant='muted' size='iconLarge' aria-label={T('App.Close')} onClick={onClose} className='mt-4 shrink-0'>
                    <IoClose size={24} />
                </Button>

                <DialogTitleContext value={titleId}>{children}</DialogTitleContext>
            </motion.div>
        </>
    );
}

/**
 * SheetHeader - Centred title and subtitle of a sheet.
 * @param {object} props Component props.
 * @param {string} props.title The sheet title.
 * @param {string} props.subtitle The muted line under it.
 * @returns {JSX.Element} The header block.
 */
export function SheetHeader({ title, subtitle }: { title: string; subtitle: string }) {
    const titleId = useDialogTitleId();

    return (
        <Vertical>
            <Text as='h2' id={titleId} variant='title' className='text-center sm:text-large' text={title} />

            <Text className='text-center sm:text-small' text={subtitle} />
        </Vertical>
    );
}
