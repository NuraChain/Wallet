import type { ReactNode } from 'react';

import Text from './text';

import { cn } from '../../utility/cn';
import { surfacePanel } from './panel';
import { Horizontal, Vertical } from './stack';

/**
 * FailureScreen - The full-page card the app falls back to when it cannot show anything else.
 *
 * Three copies of this existed, byte-identical down to the class strings: the router's error element,
 * the not-found route, and the error boundary. They differ only in what they say and which buttons
 * they offer, so those are the props and everything else is here.
 *
 * `detail` is the developer's half — whatever was thrown, in English, in the mono block — and it is
 * absent on the not-found screen because nothing threw. `select-text!` overrides the app-wide
 * selection reset: a stack trace nobody can copy is a stack trace nobody will report.
 *
 * The heading is an `h1`. These are the only screens in the app that are the whole page rather than
 * a panel within one, so they are the one place the document's top-level heading belongs.
 * @param {object} props Component props.
 * @param {string} props.title The headline.
 * @param {string} props.body The muted line under it.
 * @param {string} [props.detail] The thrown message, shown in a copyable mono block when present.
 * @param {string} [props.className] Extra classes for the card.
 * @param {ReactNode} props.children The actions, laid out as a row.
 * @returns {JSX.Element} The screen.
 */
export default function FailureScreen({
    title,
    body,
    detail = '',
    className = '',
    children
}: {
    title: string;
    body: string;
    detail?: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className='flex size-full items-center justify-center bg-base-1 px-4'>
            <Vertical className={cn(surfacePanel, 'w-full max-w-md gap-3 rounded-dialog p-6 text-center', className)}>
                <Text as='h1' variant='heading' text={title} />

                <Text variant='bodyMuted' text={body} />

                {detail.length > 0 && <Text dir='ltr' className='rounded-surface bg-base-3 p-2 font-mono break-all select-text!' text={detail} />}

                <Horizontal className='gap-2 *:flex-1'>{children}</Horizontal>
            </Vertical>
        </div>
    );
}
