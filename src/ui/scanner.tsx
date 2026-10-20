import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { CameraOff } from 'lucide-react';

import Spinner from './spinner';

import { cn } from '../utility/cn';

export type ScanFailure = 'denied' | 'missing' | 'unavailable';

// Frames are decoded on the main thread, so they are cut down and spaced out.
const frameSide = 480;
const frameGap = 150;

const cornerMap = [
    'top-0 inset-s-0 rounded-ss-surface border-t-3 border-s-3',
    'top-0 inset-e-0 rounded-se-surface border-t-3 border-e-3',
    'bottom-0 inset-s-0 rounded-es-surface border-b-3 border-s-3',
    'bottom-0 inset-e-0 rounded-ee-surface border-b-3 border-e-3'
] as const;

const reasonOf = (cause: unknown): ScanFailure => {
    const name = cause instanceof Error ? cause.name : '';

    if (name === 'NotAllowedError' || name === 'SecurityError') {
        return 'denied';
    }

    return name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'unavailable';
};

/** Releases the stream on unmount: one left open keeps the camera light on behind a closed dialog. */
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

            <div className='pointer-events-none absolute inset-10'>
                {cornerMap.map((corner) => (
                    <span key={corner} className={cn('absolute size-8 border-txt-accent', corner)} />
                ))}
            </div>

            {state === 'starting' && <Spinner size={32} muted />}

            {state === 'failed' && <CameraOff size={56} strokeWidth={1.5} className='text-txt-muted' />}
        </div>
    );
}
