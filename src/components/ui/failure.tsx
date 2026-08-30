import type { ReactNode } from 'react';

import Text from './text';

import { cn } from '../../utility/cn';
import { surfacePanel } from './panel';
import { Horizontal, Vertical } from './stack';

export default function FailureScreen({
    title,
    body,
    detail = '',
    className = '',
    children
}: {
    title: string;
    body: string;
    detail?: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <Horizontal className='size-full items-center justify-center bg-base-1 px-4'>
            <Vertical className={cn(surfacePanel, 'w-full max-w-md gap-3 rounded-dialog p-6 text-center', className)}>
                <Text as='h1' variant='heading' text={title} />

                <Text variant='bodyMuted' text={body} />

                {detail.length > 0 && <Text dir='ltr' className='rounded-surface bg-base-3 p-2 font-mono break-all select-text!' text={detail} />}

                <Horizontal className='gap-2 *:flex-1'>{children}</Horizontal>
            </Vertical>
        </Horizontal>
    );
}
