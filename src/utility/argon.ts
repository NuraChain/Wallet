import { argon2id as compute, type IArgon2Options } from 'hash-wasm';

import type { ArgonReply } from '../type/argon';

/* For a host that never answers; a script that fails to load reports an error itself. */
const startLimit = 5000;

// Once a worker has failed, nothing later in the session waits on another.
let unusable = typeof Worker === 'undefined';

const away = async (options: IArgon2Options) =>
    new Promise<string | Uint8Array>((resolve, reject) => {
        // Without `./` Vite tries the name as a package first.
        // oxlint-disable-next-line unicorn/relative-url-style
        const worker = new Worker(new URL('./argon.worker.ts', import.meta.url), { type: 'module' });

        const fail = () => {
            clearTimeout(silent);

            worker.terminate();

            reject(new Error('argon worker'));
        };

        const silent = setTimeout(fail, startLimit);

        worker.addEventListener('message', (event: MessageEvent<ArgonReply>) => {
            const reply = event.data;

            if (reply.kind === 'ready') {
                clearTimeout(silent);

                return;
            }

            if (reply.kind === 'failed') {
                fail();

                return;
            }

            clearTimeout(silent);

            worker.terminate();

            resolve(reply.value);
        });

        worker.addEventListener('error', fail);
        worker.addEventListener('messageerror', fail);

        // A worker has no origin to be named.
        // oxlint-disable-next-line unicorn/require-post-message-target-origin
        worker.postMessage(options);
    });

/**
 * hash-wasm's `argon2id`, off the page's thread so the unlock spinner keeps drawing.
 * Runs here instead when no worker starts or it fails: a wallet that opens slowly beats one that does not open.
 */
export const argon2id = async <T extends IArgon2Options>(options: T): ReturnType<typeof compute<T>> => {
    if (!unusable) {
        try {
            const value = await away(options);

            if (options.outputType === 'binary' ? value instanceof Uint8Array : typeof value === 'string') {
                // Checked above against what was asked for.
                // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                return value as Awaited<ReturnType<typeof compute<T>>>;
            }
        } catch {
            // Falls through to the hash run here.
        }

        unusable = true;
    }

    return compute(options);
};
