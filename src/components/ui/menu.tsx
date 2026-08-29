import type { ReactNode } from 'react';

import Text from './text';
import Button from './button';

import { cn } from '../../utility/cn';

/**
 * What "this is the one you are on" looks like.
 *
 * Four surfaces had each arrived at their own answer: the account switcher, the send flow's asset
 * picker and the browser's tab strip all landed on this tint independently, at three different radii
 * and two different durations, and the nav bar used a pressed-state token as a resting fill — the only
 * place in the app an `-active` value meant anything other than "being pressed right now".
 *
 * The border matters as much as the fill. A selected row that differs only by a wash of colour is a
 * selected row nobody can find in a high-contrast mode, and it fails "do not rely on colour alone" on
 * its own; every call site pairs this with a tick or a filled indicator for the same reason.
 */
export const selectedTint = 'border-btn-primary-border bg-btn-primary/15';

/**
 * MenuRow - A list row: something on the left, a label, something on the right.
 *
 * One row for the three the app had. The settings dialog navigated with it, the network picker and
 * the language picker each selected with their own copy of it, and the three had drifted onto two
 * heights, two leading treatments and two ideas of what "current" looks like — while being, on any
 * screen, obviously meant to be the same object.
 *
 * `leading` is passed whole rather than wrapped. A settings row leads with an `IconBox`, a network
 * row with the coin's logo and a language row with a flag, and a component that wrapped all three in
 * the same square would have had to be argued out of it twice.
 *
 * `selected` says the row is the current choice. It does not disable it: the pickers used `disabled`
 * for this, which is a different claim — that the control cannot be used — and it is why one of them
 * then had to hand back a `disabled:cursor-default!` to undo the cursor that came with it.
 * @param {object} props Component props.
 * @param {ReactNode} [props.leading] Rendered at the start of the row.
 * @param {string} props.label The row label.
 * @param {ReactNode} [props.trailing] Chevron, tick or value on the end of the row.
 * @param {boolean} [props.selected] Whether this row is the current choice.
 * @param {string} [props.className] Extra classes; conflicting utilities override the row's.
 * @param {() => void} props.onClick Activates the row.
 * @returns {JSX.Element} The row.
 */
export default function MenuRow({
    leading,
    label,
    trailing,
    selected = false,
    className = '',
    onClick
}: {
    leading?: ReactNode;
    label: string;
    trailing?: ReactNode;
    selected?: boolean;
    className?: string;
    onClick: () => void;
}) {
    return (
        <Button
            variant='muted'
            aria-current={selected || undefined}
            onClick={onClick}
            className={cn('h-12 gap-3 rounded-surface px-3', selected && `${selectedTint} cursor-default`, className)}
        >
            {leading}

            <Text variant='body' className='min-w-0 flex-1 truncate text-start' text={label} />

            {trailing}
        </Button>
    );
}
