import type { Token } from '../../core/token';

import { useRef, useState } from 'react';
import { formatUnits } from 'ethers';
import { Globe } from 'lucide-react';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Panel from '../ui/panel';
import Button from '../ui/button';
import IconBox from '../ui/iconbox';
import ScrollBar from '../ui/scrollbar';
import AddressBlock from '../ui/address';
import { Horizontal, Vertical } from '../ui/stack';
import { Modal, ModalActions, ModalBody, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { readCalldata } from '../../core/calldata';
import { shortAddress, trimAmount } from '../../utility/format';
import { resolveDappPrompt, type DappPrompt } from '../../core/dapp.rpc';

const titleMap: Record<DappPrompt['kind'], string> = {
    connect: 'Dashboard.Request.Connect',
    signature: 'Dashboard.Request.Signature',
    typed: 'Dashboard.Request.Typed',
    transaction: 'Dashboard.Request.Transaction',
    chain: 'Dashboard.Request.Chain',
    asset: 'Dashboard.Request.Asset'
};

const noteMap: Record<DappPrompt['kind'], string> = {
    connect: 'Dashboard.Request.ConnectNote',
    signature: 'Dashboard.Request.SignatureNote',
    typed: 'Dashboard.Request.TypedNote',
    transaction: 'Dashboard.Request.TransactionNote',
    chain: 'Dashboard.Request.ChainNote',
    asset: 'Dashboard.Request.AssetNote'
};

interface Row {
    label: string;
    value: string;
    mono: boolean;
}

export default function DashboardRequest({ prompt, address, network, tokens }: { prompt: DappPrompt; address: string; network: string; tokens: Token[] }) {
    const [isLoading, setIsLoading] = useState(false);

    const payloadRef = useRef<HTMLDivElement>(null);

    const onAnswer = (approved: boolean) => {
        if (isLoading) {
            return;
        }

        setIsLoading(true);

        resolveDappPrompt(prompt.id, approved);
    };

    const onClose = () => {
        onAnswer(false);
    };

    const transaction = prompt.kind === 'transaction' ? prompt.transaction : undefined;

    const call = transaction === undefined || transaction.data.length === 0 ? undefined : readCalldata(transaction.data);

    const risky = call?.approval === true;

    /* The contract being called is the token whose allowance is at stake, so its own decimals are
       the only ones that make the number mean anything. A contract the wallet does not track keeps
       base units rather than being formatted against a guess. */
    const subject = tokens.find((item) => item.address.toLowerCase() === (transaction?.to ?? '').toLowerCase());

    const allowance = () => {
        if (call?.unlimited === true) {
            return T('Dashboard.Request.AllowanceUnlimited');
        }

        if (call?.amount === undefined) {
            return '';
        }

        if (subject === undefined) {
            return call.amount.toString();
        }

        return `${trimAmount(formatUnits(call.amount, subject.decimals))} ${subject.symbol}`;
    };

    const rows = (): Row[] => {
        if (transaction !== undefined) {
            const { value, fee, data } = transaction;

            return [
                { label: T('Dashboard.Request.Value'), value, mono: true },
                ...(call === undefined
                    ? []
                    : [{ label: T('Dashboard.Request.Method'), value: call.method.length > 0 ? call.method : call.selector, mono: true }]),
                ...(risky ? [{ label: T('Dashboard.Request.Allowance'), value: allowance(), mono: true }] : []),
                ...(fee.length > 0 ? [{ label: T('Dashboard.Request.Fee'), value: fee, mono: true }] : []),
                { label: T('Dashboard.Network.Title'), value: network, mono: false },
                ...(data.length > 0 ? [{ label: T('Dashboard.Request.Data'), value: T('Dashboard.Request.DataSize', call?.bytes ?? 0), mono: false }] : [])
            ];
        }

        if (prompt.kind === 'chain' && prompt.chain !== undefined) {
            return [
                { label: T('Dashboard.Request.ChainName'), value: prompt.chain.name, mono: false },
                { label: T('Dashboard.Network.ChainId'), value: String(prompt.chain.id), mono: true }
            ];
        }

        if (prompt.kind === 'asset' && prompt.asset !== undefined) {
            return [
                { label: T('Dashboard.Request.AssetSymbol'), value: prompt.asset.symbol.length > 0 ? prompt.asset.symbol : '—', mono: false },
                { label: T('Dashboard.Network.Title'), value: network, mono: false }
            ];
        }

        return [
            { label: T('Dashboard.Request.Account'), value: shortAddress(address), mono: true },
            { label: T('Dashboard.Network.Title'), value: network, mono: false }
        ];
    };

    /* Never `shortAddress` here. This is the screen the whole approval exists for, and a poisoning
       contract is picked to match the first and last characters a truncation keeps. The spender of
       an allowance gets the same treatment for the same reason. */
    const addresses = (): Row[] => {
        if (transaction !== undefined) {
            return [
                { label: T('Dashboard.Request.To'), value: transaction.to.length > 0 ? transaction.to : T('Dashboard.Request.Deploy'), mono: true },
                ...(risky && call.spender.length > 0 ? [{ label: T('Dashboard.Request.Spender'), value: call.spender, mono: true }] : [])
            ];
        }

        if (prompt.kind === 'asset' && prompt.asset !== undefined) {
            return [{ label: T('Dashboard.Request.AssetAddress'), value: prompt.asset.address, mono: true }];
        }

        return [];
    };

    const payload = prompt.kind === 'signature' || prompt.kind === 'typed' ? prompt.summary : '';

    const endpoint = prompt.kind === 'chain' ? (prompt.chain?.rpc ?? '') : '';

    return (
        <Modal scroll onClose={onClose}>
            <ModalHeader title={T(titleMap[prompt.kind])} onClose={onClose} />

            <Panel className='flex items-center gap-2'>
                <IconBox tone='primary'>
                    <Globe size={16} />
                </IconBox>

                <Vertical className='min-w-0 gap-0.5'>
                    <Text variant='captionStrong' dir='ltr' className='min-w-0 truncate font-mono' text={prompt.origin} />
                </Vertical>
            </Panel>

            {/* Red is the product's one warning colour, so it is spent on the call that can still
                take tokens after this dialog is gone, not on every routine note. */}
            <Alert variant='warning' className='text-start' text={T(noteMap[prompt.kind])} />

            <Alert
                variant='error'
                size='comfortable'
                className='text-start'
                text={risky ? T('Dashboard.Request.AllowanceNote', allowance(), subject?.symbol ?? T('Dashboard.Request.AllowanceToken')) : ''}
            />

            <ModalBody>
                <Panel className='flex flex-col gap-2'>
                    {rows().map((item) => (
                        <Horizontal key={item.label} className='items-center justify-between gap-2'>
                            <Text className='shrink-0' text={item.label} />

                            <Text
                                variant='captionStrong'
                                dir={item.mono ? 'ltr' : undefined}
                                className={item.mono ? 'min-w-0 truncate font-mono' : 'min-w-0 truncate'}
                                text={item.value}
                            />
                        </Horizontal>
                    ))}
                </Panel>

                {addresses().map((item) => (
                    <Panel key={item.label}>
                        <AddressBlock label={item.label} address={item.value} />
                    </Panel>
                ))}

                {endpoint.length > 0 && (
                    <Vertical className='gap-1'>
                        <Text text={T('Dashboard.Request.ChainRpc')} />

                        <Panel>
                            <Text variant='captionStrong' dir='ltr' className='font-mono wrap-break-word' text={endpoint} />
                        </Panel>
                    </Vertical>
                )}

                {payload.length > 0 && (
                    <Vertical className='gap-1'>
                        <Text text={T('Dashboard.Request.Message')} />

                        <Vertical className='relative'>
                            <Panel ref={payloadRef} className='max-h-48 overflow-y-auto overscroll-contain'>
                                <Text variant='captionStrong' dir='ltr' className='font-mono wrap-break-word whitespace-pre-wrap' text={payload} />
                            </Panel>

                            <ScrollBar viewportRef={payloadRef} className='inset-e-2 top-2' />
                        </Vertical>
                    </Vertical>
                )}
            </ModalBody>

            {/* On an allowance the safe answer carries the weight: the expensive mistake here is the
                reflex tap on whatever looks like the primary button. */}
            <ModalActions>
                <Button dim variant={risky ? 'primary' : 'muted'} size='action' disabled={isLoading} onClick={onClose} text={T('Dashboard.Request.Reject')} />

                <Button
                    dim
                    variant={risky ? 'destructive' : 'primary'}
                    size='action'
                    disabled={isLoading}
                    onClick={() => {
                        onAnswer(true);
                    }}
                    text={T('Dashboard.Request.Approve')}
                />
            </ModalActions>
        </Modal>
    );
}
