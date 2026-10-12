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
    /** A one-line notice set in a tight space. */
    dense: 'text-tiny rounded-control px-2 py-1',
    /** A page's own message, as wide as its words. */
    banner: 'text-small rounded-control px-4 py-2'
} as const;

export default function Alert(
    props: {
        variant?: keyof typeof variantMap;
        size?: keyof typeof sizeMap;
        text?: string;
        textAlign?: 'start';
        mono?: boolean;
        /** A control of the notice's own, set under its words. For the variants laid out as a row. */
        action?: ReactNode;
        /** A control at the far end of the notice, such as the one that puts it away. */
        trailing?: ReactNode;
        children?: ReactNode;
    } & Placement &
        Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>
) {
    const [place, { variant = 'error', size = 'compact', text, textAlign, mono = false, action, trailing, children, ...rest }] = splitPlacement(props);

    const content = text ?? children;

    const success = variant === 'success';

    /* The announcement lives in `Live`, which stays mounted whether or not there is anything to
       say. It used to ride on the box below, which only exists once it has a message — and a live
       region that appears together with its own text is not announced at all. */
    const spoken = typeof content === 'string' ? content : '';

    const body = variant === 'error' ? content : <span>{content}</span>;

    return (
        <>
            <Live text={spoken} assertive={!success} />

            {content !== undefined && content !== '' && (
                <div className={cn(variantMap[variant], sizeMap[size], textAlign === 'start' && 'text-start', mono && 'font-mono', placement(place))} {...rest}>
                    {variant === 'warning' && <TriangleAlert size={16} className='mt-0.5 shrink-0' />}

                    {success && <CircleCheckBig size={16} className='mt-0.5 shrink-0' />}

                    {/* With a control of its own the words take the room between the glyph and the far
                        end, and the control sits under them; with none, nothing is wrapped at all. */}
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
