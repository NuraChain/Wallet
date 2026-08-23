import { FiInbox } from 'react-icons/fi';

import Text from './text';
import Spinner from './spinner';

import { cn } from '../../utility/cn';
import { surfacePanel } from './panel';

/**
 * What each state leads with.
 *
 * `empty` is the inbox glyph a list with nothing in it always had. `loading` is the app's one spinner
 * — a list that is still arriving is a list, not a blank space, and it used to say so five different
 * ways: a caption at `py-4`, the same caption at `py-6`, a 32px spinner, a swapped button label, and
 * a bare ellipsis on the wallet headline. Two of those five rendered the identical message from the
 * identical data source at two different paddings, one screen apart from each other.
 */
const iconMap =
{
    empty: <FiInbox size={ 24 } className='text-txt-muted' />,
    loading: <Spinner size={ 24 } className='text-txt-muted' />
} as const;

/**
 * StatusBlock - What a list shows when it has nothing to show yet, or nothing to show at all.
 *
 * One block for both, because they occupy the same slot and differ only in the glyph and the line —
 * and keeping them apart is what let them drift.
 *
 * `aria-live` is the reason this is worth one component rather than two: a list that finishes loading
 * and turns out to be empty is a change worth hearing, and it was silent at every site this replaces.
 *
 * `panel` wraps it in the card the wallet tab uses; without it the block floats on the page the way
 * the history overview draws it.
 * @param {object} props Component props.
 * @param {'empty' | 'loading'} [props.state] Which of the two this is.
 * @param {string} props.text The muted message.
 * @param {boolean} [props.panel] Wraps the block in a card.
 * @param {string} [props.className] Extra classes for the block.
 * @returns {JSX.Element} The block.
 */
export default function StatusBlock({ state = 'empty', text, panel = false, className = '' }: { state?: keyof typeof iconMap; text: string; panel?: boolean; className?: string })
{
    return (
        <div
            aria-live='polite'
            className={ cn('flex flex-col items-center gap-1 text-center', panel ? `${ surfacePanel } rounded-surface px-3 py-6` : 'py-10', className) }>

            { iconMap[state] }

            <Text variant='bodyMuted' text={ text } />

        </div>
    );
}
