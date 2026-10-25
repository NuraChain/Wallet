import { ethers } from 'ethers';
import { beforeEach, describe, expect, it } from 'vitest';

import config from '../config';
import { estimateSwapFee, minimumOut, quoteSwap, runSwap, swapDeadline, swapKind } from '../core/swap';
import type { SwapAsset, SwapPlan } from '../type/swap';

const native: SwapAsset = { address: '', symbol: 'Nura', name: 'Nura', decimals: 18 };

const find = (symbol: string) => {
    const asset = config.swap.tokens.find((item) => item.symbol === symbol);

    if (asset === undefined) {
        throw new Error(`no ${symbol} in the swap list`);
    }

    return asset;
};

const wnura = find('WNURA');
const usdt = find('USDT');

const factory = new ethers.Interface(['function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)']);
const quoter = new ethers.Interface([
    'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
]);
const router = new ethers.Interface([
    'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)'
]);
const token = new ethers.Interface([
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)'
]);

const blockTime = 1_800_000_000;

// Which tiers have a pool, what each quotes, and what allowance the router already holds.
const chain = { pools: new Map<number, bigint>(), allowance: 0n };

const sent: ethers.Transaction[] = [];

const same = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

const answer = (method: string, params: unknown[]): unknown => {
    if (method === 'eth_call') {
        const call = params[0] as { to: string; data: string };

        if (same(call.to, config.swap.factory)) {
            const fee = factory.decodeFunctionData('getPool', call.data)[2];

            return factory.encodeFunctionResult('getPool', [chain.pools.has(Number(fee)) ? '0x00000000000000000000000000000000000000aa' : ethers.ZeroAddress]);
        }

        if (same(call.to, config.swap.quoter)) {
            const [quoted] = quoter.decodeFunctionData('quoteExactInputSingle', call.data);

            return quoter.encodeFunctionResult('quoteExactInputSingle', [chain.pools.get(Number(quoted.fee)) ?? 0n, 0n, 1, 80_000n]);
        }

        return token.encodeFunctionResult('allowance', [chain.allowance]);
    }

    if (method === 'eth_sendRawTransaction') {
        const transaction = ethers.Transaction.from(String(params[0]));

        sent.push(transaction);

        return transaction.hash;
    }

    if (method === 'eth_getTransactionReceipt') {
        return {
            transactionHash: params[0],
            transactionIndex: '0x0',
            blockHash: ethers.ZeroHash,
            blockNumber: '0x5',
            from: ethers.ZeroAddress,
            to: ethers.ZeroAddress,
            contractAddress: null,
            logsBloom: `0x${'0'.repeat(512)}`,
            logs: [],
            gasUsed: '0x5208',
            cumulativeGasUsed: '0x5208',
            effectiveGasPrice: '0x1',
            type: '0x2',
            status: '0x1'
        };
    }

    const fixed: Record<string, unknown> = {
        eth_chainId: '0x3fc',
        eth_blockNumber: '0x5',
        eth_getTransactionCount: '0x0',
        eth_estimateGas: '0x30000',
        eth_gasPrice: '0x3b9aca00',
        eth_maxPriorityFeePerGas: '0x3b9aca00',
        eth_getBlockByNumber: {
            hash: ethers.ZeroHash,
            parentHash: ethers.ZeroHash,
            number: '0x5',
            timestamp: `0x${blockTime.toString(16)}`,
            nonce: '0x0000000000000000',
            difficulty: '0x0',
            gasLimit: '0x1c9c380',
            gasUsed: '0x0',
            miner: ethers.ZeroAddress,
            extraData: '0x',
            baseFeePerGas: '0x3b9aca00',
            transactions: []
        }
    };

    if (!(method in fixed)) {
        throw new Error(`${method} is not answered offline`);
    }

    return fixed[method];
};

// Never the real chain: everything a quote or a swap asks for is answered here.
class OfflineProvider extends ethers.JsonRpcProvider {
    override async _send(payload: ethers.JsonRpcPayload | ethers.JsonRpcPayload[]): Promise<ethers.JsonRpcResult[]> {
        return (Array.isArray(payload) ? payload : [payload]).map((item) => ({
            id: item.id,
            result: answer(item.method, Array.isArray(item.params) ? item.params : [])
        }));
    }
}

const fresh = () => new OfflineProvider('http://offline.invalid', 1020, { staticNetwork: true, cacheTimeout: -1 });

const plan = (from: SwapAsset, to: SwapAsset, amountIn: bigint, amountOut: bigint, fee = 3000): SwapPlan => ({
    from,
    to,
    quote: { kind: swapKind(from, to) ?? 'swap', amountIn, amountOut, fee, gas: 80_000n },
    minimum: minimumOut(amountOut, 50)
});

beforeEach(() => {
    chain.pools = new Map();
    chain.allowance = 0n;
    sent.length = 0;
});

describe('what may be traded', () => {
    it('trades the native coin with WNURA alone, and never through the router', () => {
        expect(swapKind(native, wnura)).toBe('wrap');
        expect(swapKind(wnura, native)).toBe('unwrap');
        expect(swapKind(native, usdt)).toBeUndefined();
        expect(swapKind(usdt, native)).toBeUndefined();
        expect(swapKind(usdt, wnura)).toBe('swap');
        expect(swapKind(usdt, usdt)).toBeUndefined();
    });
});

describe('quotes', () => {
    it('takes the fee tier that gives the most, among the pools that exist', async () => {
        chain.pools.set(500, 90n);
        chain.pools.set(3000, 95n);

        const quote = await quoteSwap(fresh(), usdt, wnura, 100n);

        expect(quote).toEqual({ kind: 'swap', amountIn: 100n, amountOut: 95n, fee: 3000, gas: 80_000n });
    });

    it('has nothing to offer where no pool exists', async () => {
        await expect(quoteSwap(fresh(), usdt, wnura, 100n)).resolves.toBeUndefined();
    });

    it('wraps one for one without asking the chain', async () => {
        await expect(quoteSwap(fresh(), native, wnura, 7n)).resolves.toEqual({ kind: 'wrap', amountIn: 7n, amountOut: 7n, fee: 0, gas: 0n });
    });

    it('holds back the slippage from the minimum', () => {
        expect(minimumOut(10_000n, 50)).toBe(9950n);
        expect(minimumOut(1_000_000n, 100)).toBe(990_000n);
    });

    it('sets the deadline by the chain clock', async () => {
        await expect(swapDeadline(fresh())).resolves.toBe(BigInt(blockTime + 20 * 60));
    });
});

describe('swapping', () => {
    const signer = () => new ethers.Wallet(ethers.Wallet.createRandom().privateKey, fresh());

    it('approves the exact amount, then swaps with no value attached', async () => {
        const wallet = signer();

        let approved = false;

        await runSwap(wallet, plan(usdt, wnura, 1000n, 950n), () => {
            approved = true;
        });

        expect(approved).toBe(true);
        expect(sent).toHaveLength(2);

        const [approval, swap] = sent;

        expect(approval.to).toBe(ethers.getAddress(usdt.address));
        expect(token.decodeFunctionData('approve', approval.data)).toEqual([ethers.getAddress(config.swap.router), 1000n]);

        expect(swap.to).toBe(ethers.getAddress(config.swap.router));
        expect(swap.value).toBe(0n);

        const [params] = router.decodeFunctionData('exactInputSingle', swap.data);

        expect(params.recipient).toBe(wallet.address);
        expect(params.amountIn).toBe(1000n);
        expect(params.amountOutMinimum).toBe(945n);
        expect(params.fee).toBe(3000n);
        expect(params.deadline).toBe(BigInt(blockTime + 20 * 60));
    });

    it('skips the approval when the router may already spend enough', async () => {
        chain.allowance = 1000n;

        await runSwap(signer(), plan(usdt, wnura, 1000n, 950n));

        expect(sent).toHaveLength(1);
        expect(sent[0].to).toBe(ethers.getAddress(config.swap.router));
    });

    it('wraps through WNURA itself, carrying the value', async () => {
        await runSwap(signer(), plan(native, wnura, 5n, 5n));

        expect(sent).toHaveLength(1);
        expect(sent[0].to).toBe(ethers.getAddress(config.swap.wnura));
        expect(sent[0].value).toBe(5n);
    });

    it('prices the approval and the swap together before the approval exists', async () => {
        const fee = await estimateSwapFee(fresh(), ethers.Wallet.createRandom().address, plan(usdt, wnura, 1000n, 950n));

        // estimateGas for the approval, plus the quoter's gas and the router's share, at the most a unit may cost.
        const price = 2n * 1_000_000_000n + 1_000_000_000n;

        expect(fee).toBe((0x30000n + 80_000n + 100_000n) * price);
    });
});
