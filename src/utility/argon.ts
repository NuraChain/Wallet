import { argon2id as compute, type IArgon2Options } from 'hash-wasm';

import type { ArgonReply } from '../type/argon';

/* How long a worker gets to say it has started. A script that will not load says so with an error;
   this is for a host that says nothing at all. */
const startLimit = 5000;

// Set once a worker has let the wallet down, so nothing later in the session waits on another.
let unusable = typeof Worker === 'undefined';

const away = async (options: IArgon2Options) =>
    new Promise<string | Uint8Array>((resolve, reject) => {
        // Vite reads `./` as the file beside this one; without it the name is tried as a package first.
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

        // To a worker, which has no origin to be named: that argument is a window's.
        // oxlint-disable-next-line unicorn/require-post-message-target-origin
        worker.postMessage(options);
    });

/**
 * Argon2id, off the page's own thread.
 *
 * It is hash-wasm's `argon2id` and takes the same options, which stay with the two callers that
 * own them. What changes is where it runs: at 64 MiB and three passes one hash takes most of a
 * second on a desktop and several on a phone, and on the page's thread nothing was drawn for all
 * of it — the unlock button's spinner stood still, or never appeared, through two of them.
 *
 * A worker is started for one hash and ended with it. Where there is none to start — the
 * extension's service worker, a test — or one will not start, fails or answers with the wrong
 * thing, the hash is run here instead, exactly as before: a wallet that opens slowly is the
 * failure to prefer over one that does not open.
 */
export const argon2id = async <T extends IArgon2Options>(options: T): ReturnType<typeof compute<T>> => {
    if (!unusable) {
        try {
            const value = await away(options);

            if (options.outputType === 'binary' ? value instanceof Uint8Array : typeof value === 'string') {
                // Checked above against what was asked for, which is what the type turns on.
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
