import type { ElementType, HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utility/cn';

const variantMap = {
    caption: 'text-tiny text-txt-muted',
    captionStrong: 'text-tiny text-txt-normal',
    inherit: 'text-tiny',
    body: 'text-small text-txt-normal',
    bodyMuted: 'text-small text-txt-muted',
    title: 'text-medium font-semibold text-txt-normal',
    heading: 'text-large font-semibold text-txt-normal',
    display: 'text-display font-bold text-txt-normal'
} as const;

/* oxlint-disable-next-line @typescript-eslint/naming-convention */
export default function Text({
    variant = 'caption',
    as: Tag = 'div',
    text,
    className = '',
    children,
    ...rest
}: { variant?: keyof typeof variantMap; as?: ElementType; text?: string; className?: string; children?: ReactNode } & Omit<
    HTMLAttributes<HTMLElement>,
    'className' | 'children'
>) {
    return (
        <Tag className={cn(variantMap[variant], className)} {...rest}>
            {text ?? children}
        </Tag>
    );
}
