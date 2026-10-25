import { useEffect, useMemo, useState } from 'react';
import { formatUnits, parseUnits } from 'ethers';
import { ArrowDownUp, ChevronDown, ExternalLink } from 'lucide-react';

import Text from '../../ui/text';
import Alert from '../../ui/alert';
import Panel from '../../ui/panel';
import Button from '../../ui/button';
import Popover from '../../ui/popover';
import ListCard from '../../ui/list';
import TokenIcon from '../../ui/token.icon';
import AddressBlock from '../../ui/address';
import SectionHeader from '../../ui/section';
import { TextField } from '../../ui/field';
import { Horizontal, Vertical } from '../../ui/stack';

import { T } from '../../utility/language';
import { latinDigits, trimAmount } from '../../utility/format';
import { useOnline } from '../../hook/connection';
import { getProvider } from '../../core/network.provider';
import { getNativeLogo, getTokenLogo } from '../../core/price';
import {
    estimateSwapFee,
    isNativeAsset,
    minimumOut,
    quoteSwap,
    readSwapBalance,
    runSwap,
    swapChainId,
    swapKind,
    swapSigner,
    swapTokens
} from '../../core/swap';
import type { Network } from '../../type/network';
import type { SwapAsset, SwapQuote } from '../../type/swap';
import type { Vault } from '../../type/wallet';

type Step = 'form' | 'pending' | 'done' | 'error';

const slippages = [10, 50, 100];

const keyOf = (asset: SwapAsset) => (isNativeAsset(asset) ? 'native' : asset.address.toLowerCase());

const readAmount = (text: string, decimals: number) => {
    try {
        return parseUnits(latinDigits(text).trim() || '0', decimals);
    } catch {
        return undefined;
    }
};

function AssetPick({
    label,
    assets,
    chosen,
    balances,
    onPick
}: {
    label: string;
    assets: SwapAsset[];
    chosen: SwapAsset;
    balances: Record<string, bigint>;
    onPick: (asset: SwapAsset) => void;
}) {
    const [open, setOpen] = useState(false);

    const logo = (asset: SwapAsset) => (isNativeAsset(asset) ? getNativeLogo(swapChainId) : getTokenLogo(swapChainId, asset.address, asset.symbol));

    const held = (asset: SwapAsset) => {
        const value = balances[keyOf(asset)];

        return value === undefined ? '…' : trimAmount(formatUnits(value, asset.decimals));
    };

    return (
        <Vertical relative>
            <Button
                variant='fieldSelect'
                title={label}
                onClick={() => {
                    setOpen(!open);
                }}
            >
                <TokenIcon primary={isNativeAsset(chosen)} kind={isNativeAsset(chosen) ? 'network' : 'token'} src={logo(chosen)} symbol={chosen.symbol} />

                <Vertical squeeze='x' grow textAlign='start'>
                    <Text variant='body' truncate text={chosen.symbol} />

                    <Text truncate text={chosen.name} />
                </Vertical>

                <Text dir='ltr' variant='captionStrong' shrink={false} mono text={held(chosen)} />

                <ChevronDown size={12} className={`shrink-0 opacity-40 transition-transform duration-(--duration-base) ${open ? 'rotate-180' : ''}`} />
            </Button>

            <Popover
                role='listbox'
                open={open}
                onClose={() => {
                    setOpen(false);
                }}
                look='list'
            >
                {assets.map((item) => (
                    <Button
                        key={keyOf(item)}
                        role='option'
                        onClick={() => {
                            setOpen(false);
                            onPick(item);
                        }}
                        variant={keyOf(item) === keyOf(chosen) ? 'optionOn' : 'option'}
                    >
                        <TokenIcon
                            primary={isNativeAsset(item)}
                            kind={isNativeAsset(item) ? 'network' : 'token'}
                            src={logo(item)}
                            symbol={item.symbol}
                            size={8}
                        />

                        <Vertical squeeze='x' grow textAlign='start'>
                            <Text variant='body' truncate text={item.symbol} />

                            <Text truncate text={item.name} />
                        </Vertical>

                        <Text dir='ltr' variant='captionStrong' shrink={false} mono text={held(item)} />
                    </Button>
                ))}
            </Popover>
        </Vertical>
    );
}

export default function DashboardSwap({
    vault,
    index,
    address,
    network,
    onSwitch,
    onSent,
    onTrack,
    onExplorer
}: {
    vault: Vault;
    index: number;
    address: string;
    network: Network;
    onSwitch: () => void;
    onSent: () => void;
    /** A token the swap paid out, so the wallet lists it. */
    onTrack: (address: string) => void;
    onExplorer: (hash: string) => void;
}) {
    const native = useMemo<SwapAsset>(
        () => ({ address: '', symbol: network.symbol, name: network.coin ?? network.name, decimals: network.decimals }),
        [network]
    );

    const assets = useMemo(() => [native, ...swapTokens], [native]);

    const [from, setFrom] = useState<SwapAsset>(swapTokens[0]);
    const [to, setTo] = useState<SwapAsset>(swapTokens[1]);
    const [amount, setAmount] = useState('');
    const [slippage, setSlippage] = useState(50);

    const [balances, setBalances] = useState<Record<string, bigint>>({});
    const [reread, setReread] = useState(0);

    // Kept with the request it answers, so a quote for an amount since replaced is never shown.
    const [answer, setAnswer] = useState<{ request: string; quote?: SwapQuote; fee?: bigint } | undefined>(undefined);

    const [step, setStep] = useState<Step>('form');
    const [approved, setApproved] = useState(false);
    const [hash, setHash] = useState('');
    const [failure, setFailure] = useState('');

    const online = useOnline();

    const onNura = network.chainId === swapChainId;

    const amountIn = readAmount(amount, from.decimals);

    const kind = swapKind(from, to);

    const request =
        onNura && kind !== undefined && amountIn !== undefined && amountIn > 0n ? `${keyOf(from)}>${keyOf(to)}:${amountIn.toString()}:${slippage}` : '';

    const answered = answer !== undefined && answer.request === request ? answer : undefined;

    const quoting = request.length > 0 && answered === undefined;

    const quote = answered?.quote;
    const fee = answered?.fee;

    const plan =
        quote === undefined ? undefined : { from, to, quote, minimum: quote.kind === 'swap' ? minimumOut(quote.amountOut, slippage) : quote.amountOut };

    useEffect(() => {
        if (!onNura) {
            return undefined;
        }

        let live = true;

        const provider = getProvider();

        void Promise.all(assets.map(async (item) => [keyOf(item), await readSwapBalance(provider, address, item).catch(() => undefined)] as const)).then(
            (read) => {
                if (live) {
                    setBalances(Object.fromEntries(read.filter((item): item is readonly [string, bigint] => item[1] !== undefined)));
                }
            }
        );

        return () => {
            live = false;
        };
    }, [onNura, address, assets, reread]);

    // Asked again a moment after the last keystroke.
    useEffect(() => {
        if (request.length === 0 || amountIn === undefined) {
            return undefined;
        }

        let live = true;

        const timer = setTimeout(() => {
            const provider = getProvider();

            void quoteSwap(provider, from, to, amountIn)
                .catch(() => undefined)
                .then(async (found) => {
                    if (!live) {
                        return;
                    }

                    setAnswer({ request, quote: found });

                    if (found === undefined) {
                        return;
                    }

                    const minimum = found.kind === 'swap' ? minimumOut(found.amountOut, slippage) : found.amountOut;

                    const priced = await estimateSwapFee(provider, address, { from, to, quote: found, minimum }).catch(() => undefined);

                    if (live) {
                        setAnswer({ request, quote: found, fee: priced });
                    }
                });
        }, 400);

        return () => {
            live = false;

            clearTimeout(timer);
        };
    }, [request, from, to, amountIn, slippage, address]);

    if (!onNura) {
        return (
            <Vertical mt={2} gap={3}>
                <Text as='h1' variant='heading' py={2} text={T('Dashboard.Swap.Title')} />

                <Panel flow='column' gap={3}>
                    <Text variant='bodyMuted' text={T('Dashboard.Swap.NotNura')} />

                    <Button variant='primary' size='action' onClick={onSwitch} text={T('Dashboard.Swap.Switch')} />
                </Panel>
            </Vertical>
        );
    }

    const balanceOf = (asset: SwapAsset) => balances[keyOf(asset)];

    const fromBalance = balanceOf(from);
    const nativeBalance = balanceOf(native);

    const short = amountIn !== undefined && fromBalance !== undefined && amountIn > fromBalance;

    // The fee is paid in the native coin, on top of the amount when that is native too.
    const feeShort = fee !== undefined && nativeBalance !== undefined && fee + (isNativeAsset(from) && amountIn !== undefined ? amountIn : 0n) > nativeBalance;

    const noPool = !quoting && kind === 'swap' && amountIn !== undefined && amountIn > 0n && quote === undefined;

    const onPick = (side: 'from' | 'to', asset: SwapAsset) => {
        const other = side === 'from' ? to : from;

        // Picking what the other side holds turns the pair around.
        if (keyOf(asset) === keyOf(other)) {
            setFrom(to);
            setTo(from);
        } else if (side === 'from') {
            setFrom(asset);
        } else {
            setTo(asset);
        }

        setStep('form');
    };

    const onFlip = () => {
        setFrom(to);
        setTo(from);
        setAmount('');
        setStep('form');
    };

    const onConfirm = async () => {
        if (plan === undefined) {
            return;
        }

        setStep('pending');
        setApproved(false);

        try {
            const sent = await runSwap(swapSigner(vault, index, getProvider()), plan, () => {
                setApproved(true);
            });

            setHash(sent);
            setStep('done');
            setAmount('');

            onSent();
            setReread((value) => value + 1);

            if (!isNativeAsset(to)) {
                onTrack(to.address);
            }
        } catch (cause) {
            setFailure(cause instanceof Error ? cause.message : String(cause));
            setStep('error');
        }
    };

    const out = () => {
        if (quoting) {
            return '…';
        }

        return quote === undefined ? '0' : trimAmount(formatUnits(quote.amountOut, to.decimals));
    };

    const rows = () => {
        if (plan === undefined) {
            return [];
        }

        const rate = (plan.quote.amountOut * 10n ** BigInt(from.decimals)) / plan.quote.amountIn;

        const priced = fee === undefined ? '—' : `${trimAmount(formatUnits(fee, network.decimals))} ${network.symbol}`;

        return [
            { label: T('Dashboard.Swap.Rate'), value: `1 ${from.symbol} = ${trimAmount(formatUnits(rate, to.decimals))} ${to.symbol}` },
            ...(plan.quote.kind === 'swap'
                ? [
                      { label: T('Dashboard.Swap.Minimum'), value: `${trimAmount(formatUnits(plan.minimum, to.decimals))} ${to.symbol}` },
                      { label: T('Dashboard.Swap.FeeTier'), value: `${plan.quote.fee / 10_000}%` }
                  ]
                : []),
            { label: T('Dashboard.Swap.NetworkFee'), value: priced }
        ];
    };

    const verb = () => {
        if (kind === 'wrap') {
            return T('Dashboard.Swap.Wrap');
        }

        return kind === 'unwrap' ? T('Dashboard.Swap.Unwrap') : T('Dashboard.Swap.Action');
    };

    const notice = () => {
        if (kind === undefined) {
            return T('Dashboard.Swap.Unsupported', native.symbol);
        }

        if (short) {
            return T('Dashboard.Send.Insufficient');
        }

        if (noPool) {
            return T('Dashboard.Swap.NoPool');
        }

        return feeShort ? T('Dashboard.Swap.FeeShort', network.symbol) : '';
    };

    const pending = step === 'pending';

    const ready = plan !== undefined && !short && !feeShort && online && !pending;

    return (
        <Vertical mt={2} gap={3}>
            <Horizontal align='center' justify='between' gap={3}>
                <Text as='h1' variant='heading' py={2} text={T('Dashboard.Swap.Title')} />

                <Button
                    variant='chip'
                    size='iconChip'
                    title={T('Dashboard.Swap.Flip')}
                    disabled={pending}
                    onClick={onFlip}
                    shrink={false}
                    icon={<ArrowDownUp size={16} />}
                />
            </Horizontal>

            <Panel flow='column' gap={2}>
                <SectionHeader title={T('Dashboard.Swap.Pay')}>
                    {!isNativeAsset(from) && fromBalance !== undefined && (
                        <Button
                            variant='muted'
                            size='small'
                            disabled={pending}
                            onClick={() => {
                                setAmount(formatUnits(fromBalance, from.decimals));
                            }}
                            text={T('Dashboard.Send.Max', trimAmount(formatUnits(fromBalance, from.decimals)))}
                        />
                    )}
                </SectionHeader>

                <AssetPick
                    label={T('Dashboard.Swap.Pay')}
                    assets={assets}
                    chosen={from}
                    balances={balances}
                    onPick={(asset) => {
                        onPick('from', asset);
                    }}
                />

                <TextField
                    value={amount}
                    dir='ltr'
                    inputMode='decimal'
                    placeholder='0.0'
                    disabled={pending}
                    onValue={(value) => {
                        setAmount(latinDigits(value));
                        setStep('form');
                    }}
                    mono
                />
            </Panel>

            <Panel flow='column' gap={2}>
                <Text text={T('Dashboard.Swap.Receive')} />

                <AssetPick
                    label={T('Dashboard.Swap.Receive')}
                    assets={assets}
                    chosen={to}
                    balances={balances}
                    onPick={(asset) => {
                        onPick('to', asset);
                    }}
                />

                <Text variant='title' dir='ltr' mono truncate text={`${out()} ${to.symbol}`} />
            </Panel>

            <Alert variant='warning' textAlign='start' text={online ? notice() : T('Dashboard.Send.Offline')} />

            {plan !== undefined && (
                <ListCard>
                    {rows().map((item) => (
                        <Horizontal key={item.label} align='center' justify='between' gap={3} p={3}>
                            <Text shrink={false} text={item.label} />

                            <Text variant='captionStrong' dir='ltr' squeeze='x' truncate mono text={item.value} />
                        </Horizontal>
                    ))}
                </ListCard>
            )}

            {kind === 'swap' && (
                <Vertical gap={1}>
                    <Text text={T('Dashboard.Swap.Slippage')} />

                    <Horizontal gap={2}>
                        {slippages.map((item) => (
                            <Button
                                key={item}
                                variant={slippage === item ? 'primary' : 'chip'}
                                size='segment'
                                grow
                                disabled={pending}
                                onClick={() => {
                                    setSlippage(item);
                                }}
                                text={`${item / 100}%`}
                            />
                        ))}
                    </Horizontal>
                </Vertical>
            )}

            <Button
                dim
                variant='primary'
                size='action'
                loading={pending}
                disabled={!ready}
                onClick={() => {
                    void onConfirm();
                }}
                text={verb()}
            />

            {pending && <Text align='center' text={T(approved ? 'Dashboard.Swap.Approved' : 'Dashboard.Swap.Pending')} />}

            {step === 'done' && (
                <Vertical gap={3}>
                    <Alert variant='success' textAlign='start' text={T('Dashboard.Swap.Done')} />

                    <AddressBlock address={hash} boxed />

                    {network.explorerUrl.length > 0 && (
                        <Button
                            variant='normal'
                            size='action'
                            onClick={() => {
                                onExplorer(hash);
                            }}
                            leftIcon={<ExternalLink size={16} />}
                            text={T('Dashboard.Send.Explorer')}
                        />
                    )}
                </Vertical>
            )}

            {step === 'error' && (
                <Vertical gap={2}>
                    <Alert textAlign='start' text={T('Dashboard.Swap.Failed')} />

                    {failure.length > 0 && (
                        <Panel>
                            <Text dir='ltr' mono breaks='words' selectable text={failure} />
                        </Panel>
                    )}
                </Vertical>
            )}
        </Vertical>
    );
}
