import type { HTMLAttributes, ReactNode } from 'react';

import Live from './live';
import { TriangleAlert, CircleCheckBig } from 'lucide-react';

import { cn } from '../../utility/cn';

const variantMap = {
    error: 'bg-txt-error/10 text-txt-error text-center',
    warning: 'bg-txt-warning/10 text-txt-warning flex items-start gap-2 text-start',
    success: 'bg-txt-success/10 text-txt-success flex items-start gap-2 text-start'
} as const;

const sizeMap = {
    compact: 'text-tiny rounded-control px-3 py-2',
    comfortable: 'text-small rounded-surface px-4 py-3'
} as const;

export default function Alert({
    variant = 'error',
    size = 'compact',
    text,
    className = '',
    children,
    ...rest
}: { variant?: keyof typeof variantMap; size?: keyof typeof sizeMap; text?: string; className?: string; children?: ReactNode } & Omit<
    HTMLAttributes<HTMLDivElement>,
    'className' | 'children'
>) {
    const content = text ?? children;

    const success = variant === 'success';

    /* The announcement lives in `Live`, which stays mounted whether or not there is anything to
       say. It used to ride on the box below, which only exists once it has a message — and a live
       region that appears together with its own text is not announced at all. */
    const spoken = typeof content === 'string' ? content : '';

    return (
        <>
            <Live text={spoken} assertive={!success} />

            {content !== undefined && content !== '' && (
                <div className={cn(variantMap[variant], sizeMap[size], className)} {...rest}>
                    {variant === 'warning' && <TriangleAlert size={16} className='mt-0.5 shrink-0' />}

                    {success && <CircleCheckBig size={16} className='mt-0.5 shrink-0' />}

                    {variant === 'error' ? content : <span>{content}</span>}
                </div>
            )}
        </>
    );
}
