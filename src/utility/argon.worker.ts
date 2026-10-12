import { argon2id, type IArgon2Options } from 'hash-wasm';

import type { ArgonReply } from '../type/argon';

/* The other half of `argon.ts`: one Argon2id, run where it cannot hold the page still. It is handed
   the options, says what came of them and is ended by the page, which takes the 64 MiB the hash
   worked in away with it. Nothing here is kept, logged or sent anywhere but back. */

const answer = (reply: ArgonReply) => {
    // A worker's own scope: the message has one place to go, and no origin to be named.
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
