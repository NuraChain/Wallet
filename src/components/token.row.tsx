import type { ReactNode } from 'react';

import Text from './ui/text';
import TokenIcon from './token.icon';

import type { ImageKind } from '../core/image';

import { cn } from '../utility/cn';
import { surfacePanel } from './ui/panel';
import { Vertical } from './ui/stack';

export function AssetAmount({ amount, value }: { amount: string; value?: string }) {
    return (
        <Vertical dir='ltr' className='shrink-0 items-end'>
            <Text variant='body' className='font-mono' text={amount} />

            {value !== undefined && <Text className='font-mono' text={value} />}
        </Vertical>
    );
}

export default function TokenRow({
    src,
    symbol,
    kind = 'unknown',
    primary = false,
    subtitle,
    panel = false,
    grouped = false,
    hover = false,
    children
}: {
    src: string;
    symbol: string;
    kind?: ImageKind;
    primary?: boolean;
    subtitle: string;
    panel?: boolean;
    grouped?: boolean;
    hover?: boolean;
    children?: ReactNode;
}) {
    return (
        <div
            className={cn(
                'flex items-center gap-3',
                panel ? `${surfacePanel} rounded-surface p-3` : '',
                grouped ? 'p-3' : '',
                !panel && !grouped ? 'p-2' : '',
                hover && 'transition-colors duration-(--duration-base) ease-initial hover:bg-btn-muted-hover'
            )}
        >
            <TokenIcon src={src} kind={kind} symbol={symbol} primary={primary} />

            <Vertical className='min-w-0 flex-1'>
                <Text variant='body' className='truncate' text={symbol} />

                <Text className='truncate' text={subtitle} />
            </Vertical>

            {children}
        </div>
    );
}
