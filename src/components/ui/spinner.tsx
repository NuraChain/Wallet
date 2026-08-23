import { FiLoader } from 'react-icons/fi';

import { cn } from '../../utility/cn';

/**
 * Spinner - The one loading glyph the app uses.
 *
 * Every busy state renders the same quarter-circle icon with `animate-spin`; this pins that pairing in
 * one place so a new surface cannot drift onto a different glyph or forget the animation.
 * @param {object} props Component props.
 * @param {number} [props.size] Icon size in pixels.
 * @param {string} [props.className] Extra classes (colour, `shrink-0`, margins).
 * @returns {JSX.Element} The spinning icon.
 */
export default function Spinner({ size = 16, className = '' }: { size?: number; className?: string })
{
    return (
        <FiLoader
            size={ size }
            className={ cn('animate-spin', className) } />
    );
}
