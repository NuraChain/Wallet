import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import Spinner from './spinner';

import { cn } from '../../utility/cn';

/**
 * Class recipe for every button in the app.
 *
 * The fills come straight from the `.btn-*` / `.chip-control` component classes in `style.css`, so
 * this file adds no colours of its own — a variant here is only the pairing of one of those fills
 * with the recurring dimension sets below. Anything a call site needs beyond that (widths, margins,
 * one-off paddings) rides in through `className`, which `cn` lets win over the variant's classes.
 *
 * `danger` is the muted fill with the error text colour — the treatment every destructive control in
 * the app already used by hand.
 */
const buttonVariants = cva('', {
    variants:
    {
        variant:
        {
            bare: '',
            primary: 'btn-primary',
            secondary: 'btn-secondary',
            normal: 'btn-normal',
            muted: 'btn-muted',
            chip: 'chip-control',
            danger: 'btn-muted text-txt-error'
        },
        size:
        {
            none: '',
            action: 'h-11 rounded-xl text-small',
            icon: 'size-8 rounded-lg',
            iconChip: 'size-9 rounded-xl',
            iconLarge: 'size-10 rounded-lg'
        }
    },
    defaultVariants:
    {
        variant: 'bare',
        size: 'none'
    }
});

/**
 * Button - The app's single button implementation.
 *
 * A styled variant gets the shared flex centring and `gap-2`; `bare` gets nothing, so controls with
 * their own complete look (nav tabs, window controls, inline icon toggles) still route through this
 * component for the `type='button'` default without inheriting any classes.
 *
 * `loading` renders the standard spinner ahead of the label — the caller keeps control of the label,
 * so swapping text while busy stays a one-line ternary at the call site.
 *
 * A button whose whole content is a label passes it as `text` and self-closes; `children` stays for
 * the ones that compose something — an icon beside a label, a stacked icon and caption, a nav tab.
 * Both render in the same slot, so the two forms are interchangeable and never combine.
 * @param {object} props Component props.
 * @param {string} [props.variant] Fill: `primary`, `secondary`, `normal`, `muted`, `chip`, `danger`, or `bare` for none.
 * @param {string} [props.size] Recurring dimensions: `action` rows, `icon`/`iconChip`/`iconLarge` squares, or `none`.
 * @param {string} [props.text] The button's label, when that is all it holds.
 * @param {boolean} [props.loading] Shows the spinner ahead of the label.
 * @param {boolean} [props.fullWidth] Stretches the button to the container width.
 * @param {ReactNode} [props.leftIcon] Rendered before the label.
 * @param {ReactNode} [props.rightIcon] Rendered after the label.
 * @param {string} [props.className] Extra classes; conflicting utilities override the variant's.
 * @returns {JSX.Element} The button.
 */
export default function Button({ variant = 'bare', size = 'none', text, loading = false, fullWidth = false, leftIcon, rightIcon, className = '', type = 'button', children, ...rest }: { text?: string; loading?: boolean; fullWidth?: boolean; leftIcon?: ReactNode; rightIcon?: ReactNode } & VariantProps<typeof buttonVariants> & ButtonHTMLAttributes<HTMLButtonElement>)
{
    return (
        <button
            type={ type }
            className={ cn(variant !== 'bare' && 'flex items-center justify-center gap-2', buttonVariants({ variant, size }), fullWidth && 'w-full', className) }
            { ...rest }>

            {
                loading && <Spinner size={ 16 } className='shrink-0' />
            }

            { leftIcon }

            { text ?? children }

            { rightIcon }

        </button>
    );
}
