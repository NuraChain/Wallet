import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// However the worker fails, the hash still runs on the page. hash-wasm is stubbed; real hashes are in password and storage tests.

const computed = vi.hoisted(() => vi.fn<(options: { outputType?: string }) => Promise<string | Uint8Array>>());

vi.mock('hash-wasm', () => ({ argon2id: computed }));

type Listener = (event: { data?: unknown }) => void;

class FakeWorker {
    public static made: FakeWorker[] = [];

    public posted: unknown[] = [];
    public ended = false;

    private readonly listeners = new Map<string, Listener[]>();

    public constructor() {
        FakeWorker.made.push(this);
    }

    public addEventListener(name: string, listener: Listener) {
        this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
    }

    public postMessage(message: unknown) {
        this.posted.push(message);
    }

    public terminate() {
        this.ended = true;
    }

    public say(name: 'message' | 'error' | 'messageerror', data?: unknown) {
        for (const listener of this.listeners.get(name) ?? []) {
            listener({ data });
        }
    }
}

const options = {
    password: 'correct-horse',
    salt: new Uint8Array(16),
    memorySize: 65_536,
    iterations: 3,
    parallelism: 1,
    hashLength: 32,
    outputType: 'hex'
} as const;

/** A plain function, since it is called with `new`. */
function RefusedWorker() {
    throw new Error('refused by the content security policy');
}

const fresh = async () => (await import('../utility/argon')).argon2id;

const worker = () => FakeWorker.made[FakeWorker.made.length - 1];

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();

    FakeWorker.made = [];

    computed.mockReset();
    computed.mockImplementation(async (asked) => (asked.outputType === 'binary' ? new Uint8Array([1, 2, 3]) : 'hashed here'));

    vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('Argon2id, run off the page', () => {
    it('hands the hash to a worker, and ends the worker with it', async () => {
        const argon2id = await fresh();

        const hashing = argon2id(options);

        expect(worker().posted).toEqual([options]);

        worker().say('message', { kind: 'ready' });
        worker().say('message', { kind: 'done', value: 'hashed there' });

        await expect(hashing).resolves.toBe('hashed there');

        expect(worker().ended).toBe(true);
        expect(computed).not.toHaveBeenCalled();
    });

    it('starts a worker for each hash', async () => {
        const argon2id = await fresh();

        const first = argon2id(options);

        worker().say('message', { kind: 'done', value: 'one' });

        await first;

        const second = argon2id(options);

        worker().say('message', { kind: 'done', value: 'two' });

        await expect(second).resolves.toBe('two');

        expect(FakeWorker.made).toHaveLength(2);
    });

    it('waits as long as the hash takes, once the worker has said it started', async () => {
        const argon2id = await fresh();

        const hashing = argon2id(options);

        worker().say('message', { kind: 'ready' });

        await vi.advanceTimersByTimeAsync(120_000);

        expect(worker().ended).toBe(false);

        worker().say('message', { kind: 'done', value: 'hashed there' });

        await expect(hashing).resolves.toBe('hashed there');

        expect(computed).not.toHaveBeenCalled();
    });

    it('runs the hash on the page where there is no worker to start', async () => {
        vi.stubGlobal('Worker', undefined);

        const argon2id = await fresh();

        await expect(argon2id(options)).resolves.toBe('hashed here');

        expect(computed).toHaveBeenCalledWith(options);
    });

    it('runs it on the page when a worker may not be started', async () => {
        vi.stubGlobal('Worker', RefusedWorker);

        const argon2id = await fresh();

        await expect(argon2id(options)).resolves.toBe('hashed here');
    });

    it("runs it on the page when the worker's script does not load", async () => {
        const argon2id = await fresh();

        const hashing = argon2id(options);

        worker().say('error');

        await expect(hashing).resolves.toBe('hashed here');

        expect(worker().ended).toBe(true);
        expect(computed).toHaveBeenCalledWith(options);
    });

    it('runs it on the page when the worker never says it has started', async () => {
        const argon2id = await fresh();

        const hashing = argon2id(options);

        await vi.advanceTimersByTimeAsync(4999);

        expect(computed).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);

        await expect(hashing).resolves.toBe('hashed here');

        expect(worker().ended).toBe(true);
    });

    it('runs it on the page when the hash fails in the worker', async () => {
        const argon2id = await fresh();

        const hashing = argon2id(options);

        worker().say('message', { kind: 'ready' });
        worker().say('message', { kind: 'failed' });

        await expect(hashing).resolves.toBe('hashed here');

        expect(worker().ended).toBe(true);
    });

    it('runs it on the page when the worker answers with the wrong kind of thing', async () => {
        const argon2id = await fresh();

        const hashing = argon2id({ ...options, outputType: 'binary' });

        worker().say('message', { kind: 'done', value: 'a string, where bytes were asked for' });

        await expect(hashing).resolves.toEqual(new Uint8Array([1, 2, 3]));
    });

    it('gives back the bytes a worker made, when bytes were asked for', async () => {
        const argon2id = await fresh();

        const hashing = argon2id({ ...options, outputType: 'binary' });

        worker().say('message', { kind: 'done', value: new Uint8Array([9, 8, 7]) });

        await expect(hashing).resolves.toEqual(new Uint8Array([9, 8, 7]));

        expect(computed).not.toHaveBeenCalled();
    });

    it('does not wait on another worker once one has let it down', async () => {
        const argon2id = await fresh();

        const hashing = argon2id(options);

        worker().say('error');

        await hashing;

        await expect(argon2id(options)).resolves.toBe('hashed here');

        expect(FakeWorker.made).toHaveLength(1);
        expect(computed).toHaveBeenCalledTimes(2);
    });

    it('lets the failure of a hash run on the page reach the caller', async () => {
        vi.stubGlobal('Worker', undefined);

        computed.mockRejectedValue(new Error('out of memory'));

        const argon2id = await fresh();

        await expect(argon2id(options)).rejects.toThrow('out of memory');
    });
});
