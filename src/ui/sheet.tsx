import type { ReactNode } from 'react';

import { motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';

import Text from './text';
import Button from './button';

import { cn } from '../utility/cn';
import { inset, layer } from './container';
import { useDialog } from './dialog';
import { surfacePanel } from './panel';
import { Vertical } from './stack';
import { transition } from './motion';

export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
    const { panelRef } = useDialog(onClose);

    const offscreen = useReducedMotion() === true ? 'translateY(0%)' : 'translateY(-100%)';

    return (
        <>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition.overlay}
                className={`absolute size-full cursor-pointer bg-scrim ${layer.dialog}`}
                onClick={onClose}
            />

            <motion.div
                ref={panelRef}
                role='dialog'
                tabIndex={-1}
                initial={{ opacity: 0, transform: offscreen }}
                animate={{ opacity: 1, transform: 'translateY(0%)', transition: transition.sheet, transitionEnd: { transform: 'none' } }}
                exit={{ opacity: 0, transform: ['translateY(0%)', offscreen], transition: transition.dismiss }}
                className={cn(
                    surfacePanel,
                    layer.dialog,
                    'absolute inset-x-2 top-0 mx-auto flex h-fit max-h-full max-w-lg flex-col gap-2 overflow-y-auto overscroll-contain rounded-b-dialog px-4 shadow-float outline-none',
                    inset.sheetTop,
                    inset.edgeBottom,
                    'sm:px-6'
                )}
            >
                <Button variant='muted' size='iconLarge' onClick={onClose} mt={4} shrink={false} icon={<X size={24} />} />

                {children}
            </motion.div>
        </>
    );
}

export function SheetHeader({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <Vertical>
            <Text as='h2' variant='title' align='center' scaleUp text={title} />

            <Text align='center' scaleUp text={subtitle} />
        </Vertical>
    );
}
