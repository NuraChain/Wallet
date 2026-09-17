import { ethers } from 'ethers';

/**
 * Just enough call decoding to tell an approval screen what it is approving.
 *
 * The transaction prompt used to describe a payload as "248 bytes", which says nothing about
 * whether the user is sending a token or handing a contract the right to take them later.
 * Unlimited allowances are the most drained thing on an EVM chain and they look, at the byte
 * level, exactly like a harmless call.
 */

/** Anything at or above this is "forever" in practice; wallets and routers both use max-uint. */
const unlimitedFloor = 1n << 255n;

interface Known {
    name: string;
    types: string[];
    /** Index of the party being handed power, and of the amount it is handed. */
    spender?: number;
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
register('transfer(address,uint256)', { amount: 1, approval: false });
register('transferFrom(address,address,uint256)', { amount: 2, approval: false });

export interface CallSummary {
    selector: string;

    /** The method name, or an empty string when the selector is not one this wallet names. */
    method: string;
    bytes: number;

    /** This call delegates spending power rather than spending it. */
    approval: boolean;
    spender: string;
    amount?: bigint;
    unlimited: boolean;
}

export const readCalldata = (data: string): CallSummary | undefined => {
    if (!data.startsWith('0x') || data.length < 10) {
        return undefined;
    }

    const selector = data.slice(0, 10).toLowerCase();
    const bytes = (data.length - 2) / 2;
    const known = abi[selector];

    if (known === undefined) {
        return { selector, method: '', bytes, approval: false, spender: '', unlimited: false };
    }

    const plain = { selector, method: known.name, bytes, approval: known.approval, spender: '', unlimited: false };

    try {
        const args = ethers.AbiCoder.defaultAbiCoder().decode(known.types, `0x${data.slice(10)}`);

        const spender = known.spender === undefined ? '' : String(args[known.spender]);

        // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const amount = known.amount === undefined ? undefined : (args[known.amount] as bigint);

        const flagAt = known.types.indexOf('bool');
        const blanket = flagAt !== -1 && args[flagAt] === true;

        return {
            ...plain,
            spender,
            amount,
            unlimited: known.approval && (blanket || (amount !== undefined && amount >= unlimitedFloor))
        };
    } catch {
        // A payload that does not decode is still a payload whose selector we recognised; say that
        // much rather than pretending the call is unknown.
        return plain;
    }
};
