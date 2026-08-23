import type { ReactNode } from 'react';

import Text from './text';
import Button from './button';
import IconBox from './iconbox';

/**
 * MenuRow - A settings-style row: leading icon box, label, trailing detail.
 *
 * The tall muted button the settings dialog stacks — icon in a neutral square, label filling the
 * middle, and whatever the row points at (a chevron, the current value) on the end.
 * @param {object} props Component props.
 * @param {ReactNode} props.icon The leading icon, rendered inside the standard muted box.
 * @param {string} props.label The row label.
 * @param {ReactNode} [props.trailing] Chevron or value on the end of the row.
 * @param {() => void} props.onClick Activates the row.
 * @returns {JSX.Element} The row.
 */
export default function MenuRow({ icon, label, trailing, onClick }: { icon: ReactNode; label: string; trailing?: ReactNode; onClick: () => void })
{
    return (
        <Button
            variant='muted'
            onClick={ onClick }
            className='h-14 gap-3 rounded-surface px-3'>

            <IconBox tone='muted' size='size-8'>

                { icon }

            </IconBox>

            <Text
                variant='body'
                className='flex-1 text-start'
                text={ label } />

            { trailing }

        </Button>
    );
}
