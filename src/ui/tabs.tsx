import type { ReactNode } from 'react';

import { motion, useReducedMotion } from 'motion/react';
import { Plus, X } from 'lucide-react';

import Text from './text';
import Button from './button';

import { cn } from '../utility/cn';
import { selectedTint } from './token';

/** A row of underlined tabs, with room at its end for an action that belongs to them. */
export function TabBar({ children }: { children: ReactNode }) {
    return (
        <div role='tablist' className='flex items-center border-b border-line'>
            {children}
        </div>
    );
}

export function Tab({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
    return (
        <Button variant={selected ? 'tabOn' : 'tab'} role='tab' onClick={onSelect}>
            {label}

            {selected && <span className='absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-txt-accent' />}
        </Button>
    );
}

// A card that leaves the grid, and the ones that close up behind it: the one place here where an
// element is on screen and then is not, which a CSS transition has nothing to say about. Asked to
// keep still, a card only fades and the rest take their new places at once: the stylesheet's own
// reduced-motion rule does not reach an animation run from here.
const settle = { type: 'tween', duration: 0.2 } as const;

const shrunk = { opacity: 0, scale: 0.92 } as const;
const faded = { opacity: 0 } as const;

/**
 * One open tab on the browser's start page, drawn the way a phone's tab overview draws one: a card
 * with the site named across its top and its page standing beneath.
 *
 * The whole card goes to the tab. Closing it is a button of its own laid over the corner, since
 * one button cannot hold another, and the name stops short of it. The card reads left to right in
 * every language, as a favourite's does: a site and its address are one pair, and the close stays
 * in the corner the name was kept clear of.
 */
export function TabCard({
    active,
    name,
    title = '',
    hint,
    art,
    onPick,
    onClose
}: {
    active: boolean;
    /** The site, across the top of the card. */
    name: string;
    /** The page's own title, where the browser can report one. */
    title?: string;
    /** The full address, for whoever hovers to check it. */
    hint: string;
    /** What stands on the page: the site's icon. */
    art: ReactNode;
    onPick: () => void;
    onClose: () => void;
}) {
    const still = useReducedMotion() === true;

    return (
        <motion.div
            dir='ltr'
            layout={!still}
            initial={still ? faded : shrunk}
            animate={{ opacity: 1, scale: 1 }}
            exit={still ? faded : shrunk}
            transition={settle}
            className={cn(
                'relative h-36 min-w-0 rounded-surface border transition-[background-color,border-color] duration-(--duration-fast) ease-initial',
                active ? selectedTint : 'border-line bg-base-2 hover:bg-base-3'
            )}
        >
            <Button title={hint} onClick={onPick} variant='tabCard'>
                <span className='flex h-10 shrink-0 items-center ps-3 pe-10'>
                    <Text variant={active ? 'captionStrong' : 'caption'} squeeze='x' grow truncate align='start' text={name} />
                </span>

                <span className='mx-1.5 mb-1.5 flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-control border border-line bg-base-1 px-2'>
                    {art}

                    {title.length > 0 && <Text width='full' truncate align='center' text={title} />}
                </span>
            </Button>

            <Button onClick={onClose} variant='tabClose' icon={<X size={14} />} />
        </motion.div>
    );
}

/** The last place in the grid of open tabs: an empty card that opens another. */
export function TabAdd({ label, onAdd }: { label: string; onAdd: () => void }) {
    const still = useReducedMotion() === true;

    return (
        <motion.div layout={!still} transition={settle} className='min-w-0'>
            <Button variant='chip' size='tabAdd' fullWidth onClick={onAdd}>
                <Plus size={20} className='shrink-0' />

                <Text variant='inherit' truncate text={label} />
            </Button>
        </motion.div>
    );
}
