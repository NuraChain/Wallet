import type { TokenBalance } from '../../core/token';

import { useMemo, useState } from 'react';
import { isAddress, parseUnits } from 'ethers';
import { IoChevronDown } from 'react-icons/io5';
import { FiArrowLeft, FiCheckCircle } from 'react-icons/fi';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Button from '../ui/button';
import Spinner from '../ui/spinner';
import TokenIcon from '../token.icon';
import SectionHeader from '../ui/section';

import Panel from '../ui/panel';
import Popover from '../ui/popover';
import { fieldSurface, TextField } from '../ui/field';
import { Modal, ModalActions, ModalHeader } from '../ui/modal';

import { selectedTint } from '../ui/menu';
import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { vaultManager, type Vault } from '../../core/vault';
import { useOnline } from '../../hook/connection';
import { getProvider } from '../../core/network.provider';
import type { Network } from '../../core/network';
import { getNativeLogo, getTokenLogo } from '../../core/price';
import { shortAddress, trimAmount } from '../../utility/format';
import { Horizontal, Vertical } from '../ui/stack';

type Step = 'form' | 'review' | 'pending' | 'success' | 'error';

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
    onClose
}: {
    vault: Vault;
    index: number;
    network: Network;
    nativeValue: bigint;
    nativeFormatted: string;
    tokens: TokenBalance[];
    onSent: () => void;
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
                logo: getTokenLogo(network.chainId, item.token.address),
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

    const online = useOnline();

    const asset = assets.find((item) => item.key === chosen) ?? assets[0];

    const onAsset = (key: string) => {
        setChosen(key);
        setPicking(false);
        setAmount('');
        setError('');
    };

    const reviewMap = [
        { label: T('Dashboard.Send.Amount'), value: `${trimAmount(amount)} ${asset.symbol}`, mono: true },
        { label: T('Dashboard.Send.To'), value: shortAddress(to), mono: true },
        { label: T('Dashboard.Network.Title'), value: network.name, mono: false }
    ];

    const onReview = () => {
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
    };

    const onConfirm = async () => {
        if (!online) {
            setFailure(T('Dashboard.Send.Offline'));
            setStep('error');

            return;
        }

        setStep('pending');

        try {
            const wallet = vaultManager(vault, index);
            const result = await wallet.send(getProvider(), { to, amount, token: asset.token });

            setHash(result);
            setStep('success');
            onSent();
        } catch {
            setFailure(T('Dashboard.Send.Error'));
            setStep('error');
        }
    };

    return (
        <Modal onClose={onClose}>
            <ModalHeader title={T('Dashboard.Send.Title')} titleClass='truncate' onClose={onClose} />

            {step === 'form' && (
                <Vertical className='gap-3'>
                    <Alert text={error} />

                    <Alert variant='warning' text={online ? '' : T('Dashboard.Send.Offline')} />

                    <Vertical className='relative gap-1'>
                        <Text text={T('Dashboard.Send.Asset')} />

                        <Button
                            aria-haspopup='listbox'
                            aria-expanded={picking}
                            onClick={() => {
                                setPicking(!picking);
                            }}
                            className={cn(fieldSurface, 'flex h-14 w-full cursor-pointer items-center gap-3 rounded-surface px-3')}
                        >
                            <TokenIcon
                                primary={asset.token === undefined}
                                kind={asset.token === undefined ? 'network' : 'token'}
                                src={asset.logo}
                                symbol={asset.symbol}
                                className='size-9'
                            />

                            <Vertical className='min-w-0 flex-1 text-start'>
                                <Text variant='body' className='truncate' text={asset.symbol} />

                                <Text className='truncate' text={asset.name} />
                            </Vertical>

                            <Text dir='ltr' variant='captionStrong' className='shrink-0 font-mono' text={trimAmount(asset.formatted)} />

                            <IoChevronDown
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
                            className='scroll-hidden flex max-h-56 flex-col gap-1 overflow-y-auto'
                        >
                            {assets.map((item) => (
                                <Button
                                    key={item.key}
                                    role='option'
                                    aria-selected={item.key === asset.key}
                                    onClick={() => {
                                        onAsset(item.key);
                                    }}
                                    className={`flex w-full cursor-pointer items-center gap-3 rounded-control border border-transparent p-2 transition-colors duration-(--duration-fast) ${item.key === asset.key ? selectedTint : 'hover:bg-btn-muted-hover'}`}
                                >
                                    <TokenIcon
                                        primary={item.token === undefined}
                                        kind={item.token === undefined ? 'network' : 'token'}
                                        src={item.logo}
                                        symbol={item.symbol}
                                        className='size-8'
                                    />

                                    <Vertical className='min-w-0 flex-1 text-start'>
                                        <Text variant='body' className='truncate' text={item.symbol} />

                                        <Text className='truncate' text={item.name} />
                                    </Vertical>

                                    <Text dir='ltr' variant='captionStrong' className='shrink-0 font-mono' text={trimAmount(item.formatted)} />
                                </Button>
                            ))}
                        </Popover>
                    </Vertical>

                    <Vertical className='gap-1'>
                        <TextField label={T('Dashboard.Send.Recipient')} value={to} dir='ltr' placeholder='0x…' onValue={setTo} className='font-mono' />
                    </Vertical>

                    <Vertical className='gap-1'>
                        <SectionHeader title={T('Dashboard.Send.Amount')}>
                            <Button
                                variant='muted'
                                onClick={() => {
                                    setAmount(asset.formatted);
                                }}
                                className='rounded-control px-2 py-0.5 text-tiny text-txt-muted'
                                text={T('Dashboard.Send.Max', trimAmount(asset.formatted))}
                            />
                        </SectionHeader>

                        <TextField
                            value={amount}
                            dir='ltr'
                            inputMode='decimal'
                            aria-label={T('Dashboard.Send.Amount')}
                            placeholder='0.0'
                            onValue={setAmount}
                            className='font-mono'
                        />
                    </Vertical>

                    <Button variant='primary' size='action' onClick={onReview} text={T('Dashboard.Send.Review')} />
                </Vertical>
            )}

            {step === 'review' && (
                <Vertical className='gap-3'>
                    <Panel className='flex flex-col gap-2'>
                        {reviewMap.map((item) => (
                            <Horizontal key={item.label} className='items-center justify-between gap-2'>
                                <Text text={item.label} />

                                <Text
                                    variant='captionStrong'
                                    dir={item.mono ? 'ltr' : undefined}
                                    className={item.mono ? 'min-w-0 truncate font-mono' : 'min-w-0 truncate'}
                                    text={item.value}
                                />
                            </Horizontal>
                        ))}
                    </Panel>

                    <ModalActions className='mt-0'>
                        <Button
                            variant='muted'
                            size='action'
                            onClick={() => {
                                setStep('form');
                            }}
                            leftIcon={<FiArrowLeft size={16} className='rtl:rotate-180' />}
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

            {step === 'pending' && (
                <Vertical className='items-center gap-3 py-6'>
                    <Spinner size={32} className='text-txt-muted' />

                    <Text variant='bodyMuted' text={T('Dashboard.Send.Pending')} />
                </Vertical>
            )}

            {step === 'success' && (
                <Vertical className='items-center gap-3 py-4'>
                    <FiCheckCircle size={40} className='text-txt-normal' />

                    <Text variant='body' text={T('Dashboard.Send.Success')} />

                    <Text dir='ltr' className='w-full rounded-surface bg-base-3 p-2 text-center font-mono break-all select-text!' text={hash} />

                    <Button variant='primary' size='action' fullWidth onClick={onClose} text={T('Dashboard.Send.Done')} />
                </Vertical>
            )}

            {step === 'error' && (
                <Vertical className='items-center gap-3 py-4'>
                    <Alert size='comfortable' className='w-full' text={failure.length > 0 ? failure : T('Dashboard.Send.Error')} />

                    <Button
                        variant='muted'
                        size='action'
                        fullWidth
                        onClick={() => {
                            setStep('form');
                        }}
                        text={T('Dashboard.Send.Back')}
                    />
                </Vertical>
            )}
        </Modal>
    );
}
