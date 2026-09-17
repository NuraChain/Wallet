import Text from './text';

import { cn } from '../../utility/cn';
import { Vertical } from './stack';

/**
 * An address shown in full, never elided.
 *
 * `shortAddress()` is for a row being scanned. This is for a screen whose whole purpose is that
 * the user can check every character before money moves: address-poisoning works by matching the
 * first and last few, which is exactly what a truncation keeps and a middle ellipsis hides.
 */
export default function AddressBlock({ address, label = '', className = '' }: { address: string; label?: string; className?: string }) {
    const value = <Text dir='ltr' variant='captionStrong' className={cn('font-mono break-all select-text!', className)} text={address} />;

    if (label.length === 0) {
        return value;
    }

    return (
        <Vertical className='min-w-0 gap-1'>
            <Text text={label} />

            {value}
        </Vertical>
    );
}
