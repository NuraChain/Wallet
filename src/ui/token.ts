/** The design strings more than one primitive is built from, kept apart so none imports another. */

export const focusRing = 'outline-2 outline-offset-2 outline-double outline-transparent focus-visible:outline-focus-ring';

export const tapArea = 'before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2';

export const fieldSurface =
    'border border-input-normal bg-input-bg outline-2 outline-offset-2 outline-double outline-transparent transition-[background-color,border-color] duration-(--duration-fast) ease-initial focus-visible:outline-focus-ring';

export const selectedTint = 'border-btn-primary-border bg-btn-primary/15';
