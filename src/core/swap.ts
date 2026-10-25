import { ethers } from 'ethers';

import config from '../config';
import { vaultManager } from './vault';
import type { SwapAsset, SwapKind, SwapPlan, SwapQuote } from '../type/swap';
import type { Vault } from '../type/wallet';

const factoryAbi = ['function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)'];

// QuoterV2: it quotes by reverting inside, so it is called, never sent.
const quoterAbi = [
    'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
];

// The first SwapRouter, whose struct carries the deadline.
const routerAbi = [
    'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)'
];

const tokenAbi = [
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)'
];

const wnuraAbi = ['function deposit() payable', 'function withdraw(uint256 amount)'];

const router = new ethers.Interface(routerAbi);
const token = new ethers.Interface(tokenAbi);
const wnura = new ethers.Interface(wnuraAbi);

// What the router spends around the pool's own swap, for a fee shown before the approval exists to estimate against.
const routerGas = 100_000n;

const deadlineSeconds = 20n * 60n;

export const swapChainId = config.swap.chainId;

export const swapTokens = config.swap.tokens;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const isNativeAsset = (asset: SwapAsset) => asset.address.length === 0;

/*
 * The router's WETH9 is not WNURA, so the native coin never goes through it: value sent alongside a swap would not be
 * wrapped, and would sit in the router for anyone's refundETH. NURA only ever trades with WNURA, by WNURA's own deposit and withdraw.
 */
export const swapKind = (from: SwapAsset, to: SwapAsset): SwapKind | undefined => {
    if (isNativeAsset(from)) {
        return same(to.address, config.swap.wnura) ? 'wrap' : undefined;
    }

    if (isNativeAsset(to)) {
        return same(from.address, config.swap.wnura) ? 'unwrap' : undefined;
    }

    return same(from.address, to.address) ? undefined : 'swap';
};

/** The best of the fee tiers that have a pool, or undefined when none does. */
export const quoteSwap = async (provider: ethers.Provider, from: SwapAsset, to: SwapAsset, amountIn: bigint): Promise<SwapQuote | undefined> => {
    const kind = swapKind(from, to);

    if (kind === undefined || amountIn <= 0n) {
        return undefined;
    }

    if (kind !== 'swap') {
        return { kind, amountIn, amountOut: amountIn, fee: 0, gas: 0n };
    }

    const factory = new ethers.Contract(config.swap.factory, factoryAbi, provider);
    const quoter = new ethers.Contract(config.swap.quoter, quoterAbi, provider);

    const quotes = await Promise.all(
        config.swap.fees.map(async (fee): Promise<SwapQuote | undefined> => {
            try {
                const pool: unknown = await factory.getPool(from.address, to.address, fee);

                if (typeof pool !== 'string' || pool === ethers.ZeroAddress) {
                    return undefined;
                }

                const quoted = (await quoter.quoteExactInputSingle.staticCall({
                    tokenIn: from.address,
                    tokenOut: to.address,
                    amountIn,
                    fee,
                    sqrtPriceLimitX96: 0n
                })) as unknown as [bigint, bigint, bigint, bigint];

                const amountOut = quoted[0];
                const gas = quoted[3];

                return amountOut > 0n ? { kind, amountIn, amountOut, fee, gas } : undefined;
            } catch {
                // A pool too thin for the amount reverts in the quoter.
                return undefined;
            }
        })
    );

    return quotes.reduce<SwapQuote | undefined>(
        (best, item) => (item !== undefined && (best === undefined || item.amountOut > best.amountOut) ? item : best),
        undefined
    );
};

/** `slippage` in basis points. */
export const minimumOut = (amountOut: bigint, slippage: number) => (amountOut * BigInt(10_000 - slippage)) / 10_000n;

// The chain's clock, not the device's: a phone set wrong would hand the router a deadline already past or far off.
export const swapDeadline = async (provider: ethers.Provider) => {
    const block = await provider.getBlock('latest');

    if (block === null) {
        throw new Error('The chain did not return its latest block');
    }

    return BigInt(block.timestamp) + deadlineSeconds;
};

const swapRequest = (owner: string, plan: SwapPlan, deadline: bigint): ethers.TransactionRequest => ({
    to: config.swap.router,
    data: router.encodeFunctionData('exactInputSingle', [
        {
            tokenIn: plan.from.address,
            tokenOut: plan.to.address,
            fee: plan.quote.fee,
            recipient: owner,
            deadline,
            amountIn: plan.quote.amountIn,
            amountOutMinimum: plan.minimum,
            sqrtPriceLimitX96: 0n
        }
    ])
});

// The exact amount, never unlimited: a grant left behind is what a compromised router would spend.
const approveRequest = (plan: SwapPlan): ethers.TransactionRequest => ({
    to: plan.from.address,
    data: token.encodeFunctionData('approve', [config.swap.router, plan.quote.amountIn])
});

const wrapRequest = (plan: SwapPlan): ethers.TransactionRequest =>
    plan.quote.kind === 'wrap'
        ? { to: config.swap.wnura, data: wnura.encodeFunctionData('deposit'), value: plan.quote.amountIn }
        : { to: config.swap.wnura, data: wnura.encodeFunctionData('withdraw', [plan.quote.amountIn]) };

export const needsApproval = async (provider: ethers.Provider, owner: string, plan: SwapPlan) => {
    if (plan.quote.kind !== 'swap') {
        return false;
    }

    const allowance: unknown = await new ethers.Contract(plan.from.address, tokenAbi, provider).allowance(owner, config.swap.router);

    return typeof allowance !== 'bigint' || allowance < plan.quote.amountIn;
};

/** In native base units, at the most each unit of gas may cost. */
export const estimateSwapFee = async (provider: ethers.Provider, owner: string, plan: SwapPlan) => {
    const fees = await provider.getFeeData();

    const price = fees.maxFeePerGas ?? fees.gasPrice ?? 0n;

    if (plan.quote.kind !== 'swap') {
        return (await provider.estimateGas({ ...wrapRequest(plan), from: owner })) * price;
    }

    if (await needsApproval(provider, owner, plan)) {
        const approval = await provider.estimateGas({ ...approveRequest(plan), from: owner });

        return (approval + plan.quote.gas + routerGas) * price;
    }

    const gas = await provider.estimateGas({ ...swapRequest(owner, plan, await swapDeadline(provider)), from: owner });

    return gas * price;
};

export const swapSigner = (vault: Vault, index: number, provider: ethers.Provider) =>
    new ethers.Wallet(vaultManager(vault, index).retrieve().Private, provider);

/** Approves first when the allowance is short, and waits for it to land: the swap cannot be estimated before it has. */
export const runSwap = async (signer: ethers.Wallet, plan: SwapPlan, onApproved?: () => void) => {
    const { provider } = signer;

    if (provider === null) {
        throw new Error('The signer has no provider');
    }

    if (plan.quote.kind !== 'swap') {
        return (await signer.sendTransaction(wrapRequest(plan))).hash;
    }

    if (await needsApproval(provider, signer.address, plan)) {
        const approval = await signer.sendTransaction(approveRequest(plan));

        const receipt = await approval.wait();

        if (receipt === null || receipt.status !== 1) {
            throw new Error('The approval did not go through');
        }

        onApproved?.();
    }

    const sent = await signer.sendTransaction(swapRequest(signer.address, plan, await swapDeadline(provider)));

    return sent.hash;
};
