import { describe, expect, it, vi } from 'vitest';

// Real hashes at real cost: any change to how a password hashes would make every existing wallet reject its own password.

const held = new Map<string, string>();

vi.mock('../platform', () => ({
    platform: { storage: { get: async (key: string) => held.get(key) } }
}));

const { passwordCheck, passwordHash } = await import('../core/password');

describe('the hash a password is checked against', () => {
    it('is what it has always been', async () => {
        expect(await passwordHash('correct-horse')).toBe('19fee73026a159e6326c74d7fa4878444d9f3116be3c1ec710984a832b5313b7');
    });

    it('is what it has always been for a password outside ASCII', async () => {
        expect(await passwordHash('پسورد-ñ-密码')).toBe('7207b7ec8af316708d4de65400009b30d468bf09834a0054912f8ec8a6369da7');
    });

    it('tells the right password from a wrong one, and from there being none', async () => {
        held.clear();

        expect(await passwordCheck('correct-horse')).toBe('missing');

        held.set('Wallet.Password', '19fee73026a159e6326c74d7fa4878444d9f3116be3c1ec710984a832b5313b7');

        expect(await passwordCheck('correct-horse')).toBe('ok');
        expect(await passwordCheck('correct-horsf')).toBe('invalid');
    });
});
