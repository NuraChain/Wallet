import { getAddress, isAddress } from 'ethers';

/* An EIP-681 payment request; the target is taken only as a hex address, never a name to look up. */
const request = /^ethereum:(?:pay-)?(?<target>0x[0-9a-f]{40})(?:@(?<chain>\d+))?(?:\/(?<call>[^?]*))?(?:\?(?<query>.*))?$/iu;

const plain = /^0x[0-9a-f]{40}$/iu;

/* A mixed-case address that fails its checksum is refused, not repaired. */
const checked = (value: string) => (plain.test(value) && isAddress(value) ? getAddress(value) : undefined);

/**
 * For a token the target is its contract and the payee is the `address` parameter; reading the target would pay the contract.
 * Only `transfer` is read, and the caller decides what a `chainId` for another network is worth.
 */
export const readRecipient = (text: string): { address: string; chainId?: number } | undefined => {
    const value = text.trim();

    const bare = checked(value);

    if (bare !== undefined) {
        return { address: bare };
    }

    const parts = request.exec(value)?.groups;

    if (parts === undefined) {
        return undefined;
    }

    const call = parts.call ?? '';

    if (call.length > 0 && call !== 'transfer') {
        return undefined;
    }

    const named = call === 'transfer' ? new URLSearchParams(parts.query ?? '').get('address') : parts.target;

    const address = checked(named ?? '');

    // The target must still be a valid address when it is the token.
    if (address === undefined || checked(parts.target) === undefined) {
        return undefined;
    }

    if (parts.chain === undefined) {
        return { address };
    }

    const chainId = Number(parts.chain);

    return Number.isSafeInteger(chainId) ? { address, chainId } : undefined;
};
