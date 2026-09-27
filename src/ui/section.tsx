import type { ReactNode } from 'react';

import Text from './text';
import { Horizontal } from './stack';

export default function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
    return (
        <Horizontal align='center' justify='between' gap={2}>
            <Text text={title} />

            {children}
        </Horizontal>
    );
}
