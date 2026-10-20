import Text from './text';
import { Vertical } from './stack';

/** Never elided: address poisoning matches the first and last few characters a truncation keeps. */
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
