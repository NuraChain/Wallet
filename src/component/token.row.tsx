import type { ReactNode } from 'react';

import Text from '../ui/text';
import TokenIcon from './token.icon';

import { cn } from '../utility/cn';
import { surfacePanel } from '../ui/panel';
import { Vertical } from '../ui/stack';
import type { ImageKind } from '../type/token';

export function AssetAmount({ amount, value }: { amount: string; value?: string }) {
    return (
        <Vertical dir='ltr' shrink={false} align='center'>
            <Text variant='body' mono text={amount} />

            {value !== undefined && <Text mono text={value} />}
        </Vertical>
    );
}

export default function TokenRow({
    src,
    symbol,
    kind = 'unknown',
    primary = false,
    subtitle,
    price,
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
    price?: string;
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

            <Vertical squeeze='x' grow>
                <Text variant='body' truncate text={symbol} />

                <Text truncate text={subtitle} />
            </Vertical>

            {price !== undefined && <Text dir='ltr' wide='only' width={24} shrink={false} align='end' mono text={price} />}

            {children}
        </div>
    );
}
