import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { CameraOff } from 'lucide-react';

import Spinner from './spinner';

/** Why there is no picture: the camera was refused, there is none to open, or it would not start. */
export type ScanFailure = 'denied' | 'missing' | 'unavailable';

/* The side a frame is cut down to before it is read, and how long passes between two reads. A code
   held at arm's length still fills enough of a square this size, and reading is work done on the
   thread the page draws on. */
const frameSide = 480;
const frameGap = 150;

const reasonOf = (cause: unknown): ScanFailure => {
    const name = cause instanceof Error ? cause.name : '';

    if (name === 'NotAllowedError' || name === 'SecurityError') {
        return 'denied';
    }

    return name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'unavailable';
};

/**
 * The camera's picture, read for a QR code until it is taken off the page.
 *
 * It asks for the camera as it mounts, which is where the host puts its own question to the user,
 * and lets go of it as it unmounts — a stream left open keeps the camera's light on behind a dialog
 * that has already closed. `onScan` is given each code once: what to make of it is the caller's,
 * and one it turns down is not handed over again on every frame it stays in view.
 */
export default function Scanner({ onScan, onFailure }: { onScan: (text: string) => void; onFailure: (reason: ScanFailure) => void }) {
    const videoRef = useRef<HTMLVideoElement>(null);

    const [state, setState] = useState<'starting' | 'live' | 'failed'>('starting');

    const report = useEffectEvent(onScan);
    const refuse = useEffectEvent(onFailure);

    useEffect(() => {
        const video = videoRef.current;

        if (video === null) {
            return undefined;
        }

        let active = true;
        let seen = '';

        let stream: MediaStream | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const release = (held: MediaStream | undefined) => {
            for (const track of held?.getTracks() ?? []) {
                track.stop();
            }
        };

        const fail = (cause: unknown) => {
            release(stream);

            if (active) {
                setState('failed');

                refuse(reasonOf(cause));
            }
        };

        const run = async () => {
            // The back camera where there is one; a laptop's only camera answers to this as well.
            const opened = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment' } });

            if (!active) {
                release(opened);

                return;
            }

            stream = opened;
            video.srcObject = opened;

            const [{ default: read }] = await Promise.all([import('jsqr'), video.play()]);

            if (!active) {
                return;
            }

            setState('live');

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', { willReadFrequently: true });

            const tick = () => {
                timer = setTimeout(tick, frameGap);

                const side = Math.min(video.videoWidth, video.videoHeight);

                if (context === null || side === 0 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                    return;
                }

                // The middle square, which is the part of the picture the frame on the page shows.
                const size = Math.min(side, frameSide);

                if (canvas.width !== size) {
                    canvas.width = size;
                    canvas.height = size;
                }

                context.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, size, size);

                const code = read(context.getImageData(0, 0, size, size).data, size, size, { inversionAttempts: 'dontInvert' });

                if (code !== null && code.data.length > 0 && code.data !== seen) {
                    seen = code.data;

                    report(code.data);
                }
            };

            tick();
        };

        run().catch(fail);

        return () => {
            active = false;

            if (timer !== undefined) {
                clearTimeout(timer);
            }

            release(stream);

            video.srcObject = null;
        };
    }, []);

    return (
        <div className='relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-dialog border border-line bg-base-3'>
            <video ref={videoRef} muted playsInline className='absolute inset-0 size-full object-cover' />

            {state === 'starting' && <Spinner size={24} muted />}

            {state === 'failed' && <CameraOff size={28} className='text-txt-muted' />}
        </div>
    );
}
