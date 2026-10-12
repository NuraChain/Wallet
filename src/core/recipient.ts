import { getAddress, isAddress } from 'ethers';

/* `ethereum:[pay-]<target>[@<chain>][/<function>][?<parameters>]`, as EIP-681 writes a payment
   request. The target is taken only as forty hex digits: a name would need a lookup, and a code is
   not the place to trust one. */
const request = /^ethereum:(?:pay-)?(?<target>0x[0-9a-f]{40})(?:@(?<chain>\d+))?(?:\/(?<call>[^?]*))?(?:\?(?<query>.*))?$/iu;

const plain = /^0x[0-9a-f]{40}$/iu;

/* An address in mixed case carries its own checksum, and one that fails it is a misread code or an
   altered one — so it is refused here rather than repaired. */
const checked = (value: string) => (plain.test(value) && isAddress(value) ? getAddress(value) : undefined);

/**
 * Who a scanned code says to pay: a bare address, or a payment request.
 *
 * A request for a token names the token's contract where the recipient would otherwise be, and
 * keeps the recipient in its `address` parameter. Reading the first address off such a code would
 * send the payment to the contract, which keeps it. Any call other than `transfer` is not a
 * payment this dialog can make, so it is not read at all.
 *
 * `chainId` is what the code asked for, when it asked: the caller decides what a code for another
 * network is worth.
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

    // The target still has to be an address when it is the token: a code with a broken one is broken.
    if (address === undefined || checked(parts.target) === undefined) {
        return undefined;
    }

    if (parts.chain === undefined) {
        return { address };
    }

    const chainId = Number(parts.chain);

    return Number.isSafeInteger(chainId) ? { address, chainId } : undefined;
};
