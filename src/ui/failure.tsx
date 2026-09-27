import type { ReactNode } from 'react';

import Text from './text';
import { cn } from '../utility/cn';
import { surfacePanel } from './panel';

export default function FailureScreen({ title, body, detail = '', children }: { title: string; body: string; detail?: string; children: ReactNode }) {
    return (
        <div className='flex size-full items-center justify-center bg-base-1 px-4'>
            <div className={cn(surfacePanel, 'flex w-full max-w-md flex-col gap-3 rounded-dialog p-6 text-center')}>
                <Text as='h1' variant='heading' text={title} />

                <Text variant='bodyMuted' text={body} />

                {detail.length > 0 && <Text dir='ltr' inset mono breaks='all' selectable text={detail} />}

                <div className='flex gap-2 *:flex-1'>{children}</div>
            </div>
        </div>
    );
}
