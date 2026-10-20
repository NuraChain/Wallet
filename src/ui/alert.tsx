import type { HTMLAttributes, ReactNode } from 'react';

import Live from './live';
import { TriangleAlert, CircleCheckBig } from 'lucide-react';

import { cn } from '../utility/cn';
import { placement, splitPlacement, type Placement } from './place';

const variantMap = {
    error: 'bg-txt-error/10 text-txt-error text-center',
    warning: 'bg-txt-warning/10 text-txt-warning flex items-start gap-2 text-start',
    success: 'bg-txt-success/10 text-txt-success flex items-start gap-2 text-start'
} as const;

const sizeMap = {
    compact: 'text-tiny rounded-control px-3 py-2',
    comfortable: 'text-small rounded-surface px-4 py-3',
    dense: 'text-tiny rounded-control px-2 py-1',
    banner: 'text-small rounded-control px-4 py-2'
} as const;

export default function Alert(
    props: {
        variant?: keyof typeof variantMap;
        size?: keyof typeof sizeMap;
        text?: string;
        textAlign?: 'start';
        mono?: boolean;
        action?: ReactNode;
        trailing?: ReactNode;
        children?: ReactNode;
    } & Placement &
        Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>
) {
    const [place, { variant = 'error', size = 'compact', text, textAlign, mono = false, action, trailing, children, ...rest }] = splitPlacement(props);

    const content = text ?? children;

    const success = variant === 'success';

    // `Live` stays mounted: a live region that appears together with its text is not announced.
    const spoken = typeof content === 'string' ? content : '';

    const body = variant === 'error' ? content : <span>{content}</span>;

    return (
        <>
            <Live text={spoken} assertive={!success} />

            {content !== undefined && content !== '' && (
                <div className={cn(variantMap[variant], sizeMap[size], textAlign === 'start' && 'text-start', mono && 'font-mono', placement(place))} {...rest}>
                    {variant === 'warning' && <TriangleAlert size={16} className='mt-0.5 shrink-0' />}

                    {success && <CircleCheckBig size={16} className='mt-0.5 shrink-0' />}

                    {action === undefined && trailing === undefined ? (
                        body
                    ) : (
                        <div className='flex min-w-0 grow flex-col items-start gap-2'>
                            {body}
                            {action}
                        </div>
                    )}

                    {trailing}
                </div>
            )}
        </>
    );
}
