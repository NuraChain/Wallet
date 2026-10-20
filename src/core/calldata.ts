import { ethers } from 'ethers';
import type { CallSummary } from '../type/dapp';

/** At or above this an allowance is unlimited in practice; wallets and routers approve max-uint. */
const unlimitedFloor = 1n << 255n;

interface Known {
    name: string;
    types: string[];
    /** Argument indexes of the spender, the payee and the amount. */
    spender?: number;
    recipient?: number;
    amount?: number;
    approval: boolean;
}

const abi: Record<string, Known> = {};

const register = (signature: string, detail: Omit<Known, 'name' | 'types'>) => {
    const open = signature.indexOf('(');

    abi[ethers.id(signature).slice(0, 10)] = {
        name: signature.slice(0, open),
        types: signature.slice(open + 1, -1).split(','),
        ...detail
    };
};

register('approve(address,uint256)', { spender: 0, amount: 1, approval: true });
register('setApprovalForAll(address,bool)', { spender: 0, approval: true });
register('increaseAllowance(address,uint256)', { spender: 0, amount: 1, approval: true });
register('transfer(address,uint256)', { recipient: 0, amount: 1, approval: false });
register('transferFrom(address,address,uint256)', { amount: 2, approval: false });

export const readCalldata = (data: string): CallSummary | undefined => {
    if (!data.startsWith('0x') || data.length < 10) {
        return undefined;
    }

    const selector = data.slice(0, 10).toLowerCase();
    const bytes = (data.length - 2) / 2;
    const known = abi[selector];

    const plain = {
        selector,
        method: known?.name ?? '',
        bytes,
        approval: known?.approval ?? false,
        spender: '',
        recipient: '',
        unlimited: false,
        revoke: false
    };

    if (known === undefined) {
        return plain;
    }

    try {
        const args = ethers.AbiCoder.defaultAbiCoder().decode(known.types, `0x${data.slice(10)}`);

        const spender = known.spender === undefined ? '' : String(args[known.spender]);
        const recipient = known.recipient === undefined ? '' : String(args[known.recipient]);

        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const amount = known.amount === undefined ? undefined : (args[known.amount] as bigint);

        const flagAt = known.types.indexOf('bool');
        const blanket = flagAt !== -1 && args[flagAt] === true;

        const revoke = (known.name === 'approve' && amount === 0n) || (known.name === 'setApprovalForAll' && !blanket);

        const approval = known.approval && !revoke;

        return {
            ...plain,
            approval,
            spender,
            recipient,
            amount,
            unlimited: approval && (blanket || (amount !== undefined && amount >= unlimitedFloor)),
            revoke
        };
    } catch {
        // The selector is known even though the payload does not decode, so say that much.
        return plain;
    }
};
