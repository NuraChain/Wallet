import type { ReactNode } from 'react';

import Text from './text';
import { Horizontal } from './stack';

export default function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
    return (
        <Horizontal className='items-center justify-between gap-2'>
            <Text text={title} />

            {children}
        </Horizontal>
    );
}
