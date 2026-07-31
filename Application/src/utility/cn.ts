import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * cn - Combines class values and resolves Tailwind conflicts.
 *
 * `clsx` handles the conditional shapes (`value && 'class'`, arrays), then `tailwind-merge` makes the
 * last conflicting utility win — so a caller's `className` can override a component's default the way
 * a prop override is expected to behave. Plain string concatenation would emit both classes and leave
 * the winner to stylesheet order, which is invisible at the call site and easy to get backwards.
 * @param {...ClassValue} values Class strings, conditionals, or arrays of either.
 * @returns {string} The merged class string.
 */
export const cn = (...values: ClassValue[]) => twMerge(clsx(values));
