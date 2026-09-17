import { ethers } from 'ethers';
import { describe, expect, it } from 'vitest';

import { readCalldata } from './calldata';

const coder = ethers.AbiCoder.defaultAbiCoder();

const encode = (signature: string, types: string[], values: unknown[]) => `${ethers.id(signature).slice(0, 10)}${coder.encode(types, values).slice(2)}`;

const spender = '0x1111111111111111111111111111111111111111';

const maxUint256 = (1n << 256n) - 1n;

describe('readCalldata', () => {
    it('ignores a plain value transfer', () => {
        expect(readCalldata('0x')).toBeUndefined();
        expect(readCalldata('')).toBeUndefined();
    });

    it('names an approve and reads its spender and amount', () => {
        const summary = readCalldata(encode('approve(address,uint256)', ['address', 'uint256'], [spender, 1000n]));

        expect(summary?.method).toBe('approve');
        expect(summary?.approval).toBe(true);
        expect(summary?.spender.toLowerCase()).toBe(spender);
        expect(summary?.amount).toBe(1000n);
        expect(summary?.unlimited).toBe(false);
    });

    it('flags max-uint as unlimited', () => {
        const summary = readCalldata(encode('approve(address,uint256)', ['address', 'uint256'], [spender, maxUint256]));

        expect(summary?.unlimited).toBe(true);
    });

    it('flags setApprovalForAll(true) as unlimited and false as not', () => {
        const on = readCalldata(encode('setApprovalForAll(address,bool)', ['address', 'bool'], [spender, true]));
        const off = readCalldata(encode('setApprovalForAll(address,bool)', ['address', 'bool'], [spender, false]));

        expect(on?.unlimited).toBe(true);
        expect(off?.unlimited).toBe(false);
        expect(off?.approval).toBe(true);
    });

    it('does not call a transfer an approval', () => {
        const summary = readCalldata(encode('transfer(address,uint256)', ['address', 'uint256'], [spender, maxUint256]));

        expect(summary?.method).toBe('transfer');
        expect(summary?.approval).toBe(false);
        expect(summary?.unlimited).toBe(false);
    });

    it('keeps an unknown selector honest', () => {
        const summary = readCalldata(`0xdeadbeef${'00'.repeat(32)}`);

        expect(summary?.method).toBe('');
        expect(summary?.selector).toBe('0xdeadbeef');
        expect(summary?.bytes).toBe(36);
    });

    it('survives a truncated payload it cannot decode', () => {
        const summary = readCalldata(`${ethers.id('approve(address,uint256)').slice(0, 10)}00`);

        expect(summary?.method).toBe('approve');
        expect(summary?.approval).toBe(true);
        expect(summary?.unlimited).toBe(false);
    });
});
