import { argon2id, type IArgon2Options } from 'hash-wasm';

import type { ArgonReply } from '../type/argon';

/* Nothing here is kept, logged or sent anywhere but back; the page ends the worker, freeing the hash's 64 MiB. */

const answer = (reply: ArgonReply) => {
    // A worker's own scope has no origin to be named.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    postMessage(reply);
};

addEventListener('message', (event: MessageEvent<IArgon2Options>) => {
    argon2id(event.data).then(
        (value) => {
            answer({ kind: 'done', value });
        },
        () => {
            answer({ kind: 'failed' });
        }
    );
});

answer({ kind: 'ready' });
