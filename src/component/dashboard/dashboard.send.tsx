import { useMemo, useState } from 'react';
import { formatUnits, isAddress, parseUnits } from 'ethers';
import { ChevronDown, ArrowLeft, CircleCheckBig, ExternalLink, Share2 } from 'lucide-react';

import Text from '../../ui/text';
import Alert from '../../ui/alert';
import Button from '../../ui/button';
import Spinner from '../../ui/spinner';
import TokenIcon from '../token.icon';
import CopyButton from '../../ui/copy';
import AddressBlock from '../../ui/address';
import SectionHeader from '../../ui/section';

import Panel from '../../ui/panel';
import Popover from '../../ui/popover';
import { TextField } from '../../ui/field';
import { Modal, ModalActions, ModalHeader } from '../../ui/modal';

import { T } from '../../utility/language';
import { vaultManager } from '../../core/vault';
import { useOnline } from '../../hook/connection';
import { useClipboard } from '../../hook/clipboard';
import { getProvider } from '../../core/network.provider';

import { getNativeLogo, getTokenLogo } from '../../core/price';
import { trimAmount } from '../../utility/format';
import { Horizontal, Vertical } from '../../ui/stack';
import type { TokenBalance } from '../../type/token';
import type { Vault } from '../../type/wallet';
import type { Network } from '../../type/network';

type Step = 'form' | 'review' | 'pending' | 'success' | 'error';

/** What a plain transfer between two accounts costs, and the floor for a reserve when there is no
    recipient yet to estimate against. */
const baseTransferGas = 21_000n;

const unknownAmount = '—';

interface Asset {
    key: string;
    symbol: string;
    name: string;
    logo: string;
    decimals: number;
    value: bigint;
    formatted: string;
    token?: { address: string; decimals: number };
}

export default function DashboardSend({
    vault,
    index,
    network,
    nativeValue,
    nativeFormatted,
    tokens,
    onSent,
    onExplorer,
    onClose
}: {
    vault: Vault;
    index: number;
    network: Network;
    nativeValue: bigint;
    nativeFormatted: string;
    tokens: TokenBalance[];
    onSent: () => void;
    onExplorer: (hash: string) => void;
    onClose: () => void;
}) {
    const assets = useMemo<Asset[]>(
        () => [
            {
                key: 'native',
                symbol: network.symbol,
                name: network.coin ?? network.name,
                logo: getNativeLogo(network.chainId),
                decimals: network.decimals,
                value: nativeValue,
                formatted: nativeFormatted
            },
            ...tokens.map((item) => ({
                key: item.token.address,
                symbol: item.token.symbol,
                name: item.token.name,
                logo: getTokenLogo(network.chainId, item.token.address, item.token.symbol),
                decimals: item.token.decimals,
                value: item.value,
                formatted: item.formatted,
                token: { address: item.token.address, decimals: item.token.decimals }
            }))
        ],
        [network, nativeValue, nativeFormatted, tokens]
    );

    const [step, setStep] = useState<Step>('form');
    const [error, setError] = useState('');
    const [failure, setFailure] = useState('');
    const [hash, setHash] = useState('');
    const [to, setTo] = useState('');
    const [amount, setAmount] = useState('');
    const [chosen, setChosen] = useState('native');
    const [picking, setPicking] = useState(false);
    const [fee, setFee] = useState<bigint | undefined>(undefined);
    const [reserved, setReserved] = useState(false);
    const [busy, setBusy] = useState(false);
    const [feeBusy, setFeeBusy] = useState(false);

    const online = useOnline();

    const clipboard = useClipboard();

    const explorerLink = network.explorerUrl.length > 0 ? `${network.explorerUrl.replace(/\/+$/u, '')}/tx/${hash}` : '';

    const onShare = () => {
        const target = explorerLink.length > 0 ? explorerLink : hash;

        if (typeof navigator.share !== 'function') {
            void clipboard.copy(target);

            return;
        }

        void navigator.share({ title: T('Dashboard.Send.Title'), text: hash, url: explorerLink }).catch(() => undefined);
    };

    const asset = assets.find((item) => item.key === chosen) ?? assets[0];

    const native = asset.token === undefined;

    const params = (value: string) => ({ to, amount: value, decimals: network.decimals, token: asset.token });

    const onAsset = (key: string) => {
        setChosen(key);
        setPicking(false);
        setAmount('');
        setError('');
        setReserved(false);
    };

    const feeText = () => {
        if (feeBusy) {
            return '…';
        }

        if (fee === undefined) {
            return unknownAmount;
        }

        return `${trimAmount(formatUnits(fee, network.decimals))} ${network.symbol}`;
    };

    /* Only the native asset pays its fee out of the same balance it is spending, so it is the only
       one with a total worth stating. A token transfer's fee comes from somewhere else entirely. */
    const totalText = () => {
        if (!native || fee === undefined) {
            return '';
        }

        try {
            return `${trimAmount(formatUnits(parseUnits(amount || '0', asset.decimals) + fee, network.decimals))} ${network.symbol}`;
        } catch {
            return '';
        }
    };

    const reviewMap = [
        { label: T('Dashboard.Send.Amount'), value: `${trimAmount(amount)} ${asset.symbol}` },
        { label: T('Dashboard.Request.Fee'), value: feeText() },
        ...(totalText().length > 0 ? [{ label: T('Dashboard.Send.Total'), value: totalText() }] : []),
        { label: T('Dashboard.Network.Title'), value: network.name }
    ];

    /**
     * `Max` used to propose the entire native balance, which cannot pay for its own gas — a
     * guaranteed revert after the user had already confirmed. The reserve is the real estimate when
     * there is a recipient to estimate against, and the plain-transfer floor when there is not.
     */
    const onMax = async () => {
        if (!native) {
            setAmount(asset.formatted);

            return;
        }

        setBusy(true);

        try {
            const provider = getProvider();

            const priced = async () => {
                const fees = await provider.getFeeData();

                return (fees.maxFeePerGas ?? fees.gasPrice ?? 0n) * baseTransferGas;
            };

            const cost = isAddress(to) ? await vaultManager(vault, index).estimate(provider, params('0')) : await priced();

            const spare = asset.value - cost;

            setAmount(spare > 0n ? formatUnits(spare, asset.decimals) : '0');
            setReserved(cost > 0n);
        } catch {
            setAmount(asset.formatted);
            setReserved(false);
        } finally {
            setBusy(false);
        }
    };

    const onReview = async () => {
        if (!isAddress(to)) {
            setError(T('Dashboard.Send.InvalidAddress'));

            return;
        }

        try {
            const parsed = parseUnits(amount || '0', asset.decimals);

            if (parsed <= 0n) {
                setError(T('Dashboard.Send.InvalidAmount'));

                return;
            }

            if (parsed > asset.value) {
                setError(T('Dashboard.Send.Insufficient'));

                return;
            }
        } catch {
            setError(T('Dashboard.Send.InvalidAmount'));

            return;
        }

        setError('');
        setStep('review');
        setFee(undefined);
        setFeeBusy(true);

        // A fee that cannot be estimated is shown as unknown rather than blocking the send: an RPC
        // that refuses to estimate is not the same thing as a transaction that cannot land.
        try {
            setFee(await vaultManager(vault, index).estimate(getProvider(), params(amount)));
        } catch {
            setFee(undefined);
        } finally {
            setFeeBusy(false);
        }
    };

    const onConfirm = async () => {
        if (!online) {
            setFailure(T('Dashboard.Send.Offline'));
            setStep('error');

            return;
        }

        setStep('pending');

        try {
            const result = await vaultManager(vault, index).send(getProvider(), params(amount));

            setHash(result);
            setStep('success');
            onSent();
        } catch (cause) {
            // The reason used to be swallowed and replaced with one generic sentence, which left
            // "nonce too low", "gas too low" and "reverted" looking like the same problem.
            setFailure(cause instanceof Error ? cause.message : String(cause));
            setStep('error');
        }
    };

    const pending = step === 'pending';

    /* Dismissing mid-broadcast used to take the hash with it, leaving a transaction in flight and
       no reference to it anywhere. The header drops its close for the same reason. */
    const dismiss = () => {
        if (!pending) {
            onClose();
        }
    };

    return (
        <Modal onClose={dismiss}>
            <ModalHeader title={T('Dashboard.Send.Title')} close={pending ? 'none' : 'icon'} truncate onClose={onClose} />

            {step === 'form' && (
                <Vertical gap={3}>
                    <Alert text={error} />

                    <Alert variant='warning' text={online ? '' : T('Dashboard.Send.Offline')} />

                    <Vertical relative gap={1}>
                        <Text text={T('Dashboard.Send.Asset')} />

                        <Button
                            aria-haspopup='listbox'
                            aria-expanded={picking}
                            onClick={() => {
                                setPicking(!picking);
                            }}
                            variant='fieldSelect'
                        >
                            <TokenIcon primary={native} kind={native ? 'network' : 'token'} src={asset.logo} symbol={asset.symbol} />

                            <Vertical squeeze='x' grow textAlign='start'>
                                <Text variant='body' truncate text={asset.symbol} />

                                <Text truncate text={asset.name} />
                            </Vertical>

                            <Text dir='ltr' variant='captionStrong' shrink={false} mono text={trimAmount(asset.formatted)} />

                            <ChevronDown
                                size={12}
                                className={`shrink-0 opacity-40 transition-transform duration-(--duration-base) ${picking ? 'rotate-180' : ''}`}
                            />
                        </Button>

                        <Popover
                            role='listbox'
                            open={picking}
                            onClose={() => {
                                setPicking(false);
                            }}
                            look='list'
                        >
                            {assets.map((item) => (
                                <Button
                                    key={item.key}
                                    role='option'
                                    aria-selected={item.key === asset.key}
                                    onClick={() => {
                                        onAsset(item.key);
                                    }}
                                    variant={item.key === asset.key ? 'optionOn' : 'option'}
                                >
                                    <TokenIcon
                                        primary={item.token === undefined}
                                        kind={item.token === undefined ? 'network' : 'token'}
                                        src={item.logo}
                                        symbol={item.symbol}
                                        size={8}
                                    />

                                    <Vertical squeeze='x' grow textAlign='start'>
                                        <Text variant='body' truncate text={item.symbol} />

                                        <Text truncate text={item.name} />
                                    </Vertical>

                                    <Text dir='ltr' variant='captionStrong' shrink={false} mono text={trimAmount(item.formatted)} />
                                </Button>
                            ))}
                        </Popover>
                    </Vertical>

                    <TextField label={T('Dashboard.Send.Recipient')} value={to} dir='ltr' placeholder='0x…' onValue={setTo} mono />

                    <Vertical gap={1}>
                        <SectionHeader title={T('Dashboard.Send.Amount')}>
                            <Button
                                dim
                                variant='muted'
                                size='small'
                                loading={busy}
                                disabled={busy}
                                onClick={() => {
                                    void onMax();
                                }}
                                text={T('Dashboard.Send.Max', trimAmount(asset.formatted))}
                            />
                        </SectionHeader>

                        <TextField
                            value={amount}
                            dir='ltr'
                            inputMode='decimal'
                            aria-label={T('Dashboard.Send.Amount')}
                            placeholder='0.0'
                            onValue={(value) => {
                                setAmount(value);
                                setReserved(false);
                            }}
                            mono
                        />

                        {reserved && <Text text={T('Dashboard.Send.Reserved')} />}
                    </Vertical>

                    <Button
                        variant='primary'
                        size='action'
                        onClick={() => {
                            void onReview();
                        }}
                        text={T('Dashboard.Send.Review')}
                    />
                </Vertical>
            )}

            {step === 'review' && (
                <Vertical gap={3}>
                    <Panel flow='column' gap={2}>
                        {reviewMap.map((item) => (
                            <Horizontal key={item.label} align='center' justify='between' gap={2}>
                                <Text shrink={false} text={item.label} />

                                <Text dir='ltr' variant='captionStrong' squeeze='x' truncate mono text={item.value} />
                            </Horizontal>
                        ))}
                    </Panel>

                    <Panel>
                        <AddressBlock label={T('Dashboard.Send.To')} address={to} />
                    </Panel>

                    <ModalActions flush>
                        <Button
                            variant='muted'
                            size='action'
                            onClick={() => {
                                setStep('form');
                            }}
                            leftIcon={<ArrowLeft size={16} className='rtl:rotate-180' />}
                            text={T('Dashboard.Send.Back')}
                        />

                        <Button
                            variant='primary'
                            size='action'
                            onClick={() => {
                                void onConfirm();
                            }}
                            text={T('Dashboard.Send.Confirm')}
                        />
                    </ModalActions>
                </Vertical>
            )}

            {pending && (
                <Vertical align='center' gap={3} py={6}>
                    <Spinner size={32} muted />

                    <Text variant='bodyMuted' text={T('Dashboard.Send.Pending')} />
                </Vertical>
            )}

            {step === 'success' && (
                <Vertical align='center' gap={3} py={4}>
                    <CircleCheckBig size={40} className='text-txt-normal' />

                    <Text variant='body' text={T('Dashboard.Send.Success')} />

                    <AddressBlock address={hash} boxed />

                    <Horizontal width='full' gap={2} even>
                        <CopyButton
                            variant='muted'
                            size='action'
                            value={hash}
                            label={T('Dashboard.Send.Copy')}
                            doneText={T('Dashboard.Send.Copied')}
                            failedText={T('Dashboard.Send.CopyFailed')}
                        >
                            {T('Dashboard.Send.Copy')}
                        </CopyButton>

                        <Button variant='muted' size='action' onClick={onShare} leftIcon={<Share2 size={16} />} text={T('Dashboard.Send.Share')} />
                    </Horizontal>

                    {explorerLink.length > 0 && (
                        <Button
                            variant='normal'
                            size='action'
                            fullWidth
                            onClick={() => {
                                onExplorer(hash);
                            }}
                            leftIcon={<ExternalLink size={16} />}
                            text={T('Dashboard.Send.Explorer')}
                        />
                    )}

                    <Button variant='primary' size='action' fullWidth onClick={onClose} text={T('Dashboard.Send.Done')} />
                </Vertical>
            )}

            {step === 'error' && (
                <Vertical gap={3} py={2}>
                    <Alert size='comfortable' textAlign='start' text={T('Dashboard.Send.Error')} />

                    {failure.length > 0 && (
                        <Panel>
                            <Text dir='ltr' mono breaks='words' selectable text={failure} />
                        </Panel>
                    )}

                    <ModalActions flush>
                        <Button
                            variant='muted'
                            size='action'
                            onClick={() => {
                                setStep('form');
                            }}
                            text={T('Dashboard.Send.Back')}
                        />

                        <Button
                            variant='primary'
                            size='action'
                            onClick={() => {
                                void onConfirm();
                            }}
                            text={T('Dashboard.Send.Retry')}
                        />
                    </ModalActions>
                </Vertical>
            )}
        </Modal>
    );
}
