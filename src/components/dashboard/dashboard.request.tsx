import { useRef, useState } from 'react';
import { FiGlobe } from 'react-icons/fi';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Panel from '../ui/panel';
import Button from '../ui/button';
import IconBox from '../ui/iconbox';
import ScrollBar from '../ui/scrollbar';
import { Horizontal, Vertical } from '../ui/stack';
import { Modal, ModalActions, ModalBody, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { shortAddress } from '../../utility/format';
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

export default function DashboardRequest({ prompt, address, network }: { prompt: DappPrompt; address: string; network: string }) {
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

    const rowMap = (): { label: string; value: string; mono: boolean }[] => {
        if (prompt.kind === 'transaction' && prompt.transaction !== undefined) {
            const { to, value, fee, data } = prompt.transaction;

            return [
                { label: T('Dashboard.Request.To'), value: to.length > 0 ? shortAddress(to) : T('Dashboard.Request.Deploy'), mono: true },
                { label: T('Dashboard.Request.Value'), value, mono: true },
                ...(fee.length > 0 ? [{ label: T('Dashboard.Request.Fee'), value: fee, mono: true }] : []),
                { label: T('Dashboard.Network.Title'), value: network, mono: false },
                ...(data.length > 0
                    ? [{ label: T('Dashboard.Request.Data'), value: T('Dashboard.Request.DataSize', Math.max(0, (data.length - 2) / 2)), mono: false }]
                    : [])
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
                { label: T('Dashboard.Request.AssetAddress'), value: shortAddress(prompt.asset.address), mono: true },
                { label: T('Dashboard.Network.Title'), value: network, mono: false }
            ];
        }

        return [
            { label: T('Dashboard.Request.Account'), value: shortAddress(address), mono: true },
            { label: T('Dashboard.Network.Title'), value: network, mono: false }
        ];
    };

    const rows = rowMap();

    const payload = prompt.kind === 'signature' || prompt.kind === 'typed' ? prompt.summary : '';

    const endpoint = prompt.kind === 'chain' ? (prompt.chain?.rpc ?? '') : '';

    return (
        <Modal scroll onClose={onClose}>
            <ModalHeader title={T(titleMap[prompt.kind])} onClose={onClose} />

            <Panel className='flex items-center gap-2'>
                <IconBox tone='primary'>
                    <FiGlobe size={16} />
                </IconBox>

                <Vertical className='min-w-0 gap-0.5'>
                    <Text variant='captionStrong' dir='ltr' className='min-w-0 truncate font-mono' text={prompt.origin} />
                </Vertical>
            </Panel>

            <Alert
                variant={prompt.kind === 'connect' ? 'warning' : 'error'}
                className={prompt.kind === 'connect' ? '' : 'text-start'}
                text={T(noteMap[prompt.kind])}
            />

            <ModalBody>
                <Panel className='flex flex-col gap-2'>
                    {rows.map((item) => (
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

            <ModalActions>
                <Button dim variant='muted' size='action' disabled={isLoading} onClick={onClose} text={T('Dashboard.Request.Reject')} />

                <Button
                    dim
                    variant='primary'
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
