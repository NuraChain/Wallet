/**
 * What the worker that runs Argon2id says back to the page that started it: `ready` once, as soon
 * as its script has run, and then how the hash it was handed came out.
 */
export type ArgonReply = { kind: 'ready' } | { kind: 'done'; value: string | Uint8Array } | { kind: 'failed' };
