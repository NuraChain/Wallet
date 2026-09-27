import { TriangleAlert } from 'lucide-react';

import LogoImage from '../assets/image/logo.png';

const logoMap = { 4: 'size-4', 5: 'size-5', 24: 'size-24' } as const;

/** The app's logo. Decorative wherever it sits beside or inside something that already has a name. */
export function Logo({ size }: { size: keyof typeof logoMap }) {
    return <img src={LogoImage} alt='' className={logoMap[size]} />;
}

/** A language's flag, beside its name in the picker. */
export function Flag({ src }: { src: string }) {
    return <img src={src} alt='' className='size-4 shrink-0 object-contain' />;
}

/** The frame a receive address's QR code is drawn in, with the warning it shows if drawing failed. */
export function QrFrame({ image, failed }: { image: string; failed: boolean }) {
    return (
        <div className='flex size-56 items-center justify-center rounded-dialog border border-badge-line bg-badge p-3'>
            {image.length > 0 && <img src={image} alt='' className='size-full' />}

            {failed && <TriangleAlert size={28} className='text-txt-error' />}
        </div>
    );
}
