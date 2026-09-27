import Text from './text';
import { Vertical } from './stack';

/**
 * An address shown in full, never elided.
 *
 * `shortAddress()` is for a row being scanned. This is for a screen whose whole purpose is that
 * the user can check every character before money moves: address-poisoning works by matching the
 * first and last few, which is exactly what a truncation keeps and a middle ellipsis hides.
 */
export default function AddressBlock({ address, label = '', boxed = false }: { address: string; label?: string; boxed?: boolean }) {
    const value = (
        <Text
            dir='ltr'
            variant='captionStrong'
            mono
            breaks='all'
            selectable
            inset={boxed}
            align={boxed ? 'center' : undefined}
            width={boxed ? 'full' : undefined}
            text={address}
        />
    );

    if (label.length === 0) {
        return value;
    }

    return (
        <Vertical squeeze='x' gap={1}>
            <Text text={label} />

            {value}
        </Vertical>
    );
}
