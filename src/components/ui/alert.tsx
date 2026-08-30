import type { HTMLAttributes, ReactNode } from 'react';

import { FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';

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

    if (content === undefined || content === '') {
        return undefined;
    }

    const success = variant === 'success';

    return (
        <div
            role={success ? 'status' : 'alert'}
            aria-live={success ? 'polite' : 'assertive'}
            className={cn(variantMap[variant], sizeMap[size], className)}
            {...rest}
        >
            {variant === 'warning' && <FiAlertTriangle size={16} className='mt-0.5 shrink-0' />}

            {success && <FiCheckCircle size={16} className='mt-0.5 shrink-0' />}

            {variant === 'error' ? content : <span>{content}</span>}
        </div>
    );
}
