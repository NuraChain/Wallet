/** `ready` comes once, as soon as the worker's script has run. */
export type ArgonReply = { kind: 'ready' } | { kind: 'done'; value: string | Uint8Array } | { kind: 'failed' };
