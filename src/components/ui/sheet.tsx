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

export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
    const { panelRef, titleId } = useDialog(onClose);

    return (
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`absolute size-full cursor-pointer bg-scrim ${layer.dialog}`}
                onClick={onClose}
            />

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
                    inset.edgeBottom,
                    'sm:mx-auto sm:px-6'
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

export function SheetHeader({ title, subtitle }: { title: string; subtitle: string }) {
    const titleId = useDialogTitleId();

    return (
        <Vertical>
            <Text as='h2' id={titleId} variant='title' className='text-center sm:text-large' text={title} />

            <Text className='text-center sm:text-small' text={subtitle} />
        </Vertical>
    );
}
