import type { ElementType, HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../utility/cn';

/**
 * The type pairings the app actually uses.
 *
 * Every variant is a size from the `--text-*` scale paired with one of the two text colours, which is
 * the only combination the design ever makes. They are transcribed from the class strings the surfaces
 * were writing out by hand — `text-tiny text-txt-muted` alone appeared thirty-one times — so naming
 * them changes nothing on screen and gives the pairing one place to live.
 *
 * `display` is the portfolio figure on the wallet tab, the one number in the app that has to read as
 * a headline. It was a `title` with the size overridden through `className`, which left the largest
 * type in the product as the only step not named here.
 *
 * `inherit` is the exception that proves the rule: it sets a size and deliberately no colour, for the
 * labels that sit inside a control whose fill decides what colour they should be. The nav tab and the
 * copy-address button were spelling `text-tiny` onto a bare `div` for exactly that reason, which is
 * the drift this component exists to stop.
 */
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

/**
 * Text - The app's typography primitive.
 *
 * Renders one of the pairings above, so a caption cannot drift onto a different size or colour by
 * being retyped. Anything a call site needs on top — `truncate`, `font-mono`, alignment, margins —
 * rides in through `className`, which `cn` lets win over the variant.
 *
 * `as` picks the element, and defaults to the `div` every one of these used to be without exception.
 * The app rendered a single heading element in its whole tree, so no screen had a document outline
 * and no dialog had a title that `aria-labelledby` could point at. A visual heading and a semantic
 * one are the same object here, and this is where they meet.
 *
 * Text that is the whole content passes as `text` and self-closes, matching `Button`, `Alert` and
 * `Checkbox`; `children` stays for the cases that genuinely compose. Both render in the same slot.
 * @param {object} props Component props.
 * @param {string} [props.variant] Which pairing to render.
 * @param {ElementType} [props.as] The element to render; defaults to `div`.
 * @param {string} [props.text] The content, when that is all it holds.
 * @param {string} [props.className] Extra classes; conflicting utilities override the variant's.
 * @param {ReactNode} [props.children] Composed content, for the cases `text` cannot express.
 * @returns {JSX.Element} The text block.
 */
/*
 * The naming rule is suspended for this one parameter, for the reason it is suspended around the
 * lazy imports in `page/dashboard.tsx`: the rule wants everything variable-like in camelCase, and
 * JSX reads a lowercase tag as an intrinsic element. A component arriving through a prop has to be
 * bound to a capitalised name before it can be rendered, so this is the one shape that cannot obey.
 */
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
