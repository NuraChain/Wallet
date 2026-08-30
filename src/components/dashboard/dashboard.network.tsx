import { useState } from 'react';
import { FiCheck, FiPlus, FiTrash2 } from 'react-icons/fi';

import TokenIcon from '../token.icon';

import Alert from '../ui/alert';
import Button from '../ui/button';
import MenuRow from '../ui/menu';
import { TextField } from '../ui/field';
import { Modal, ModalActions, ModalBody, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { getNativeLogo } from '../../core/price';
import { addNetwork, getNetworks, removeNetwork, setNetwork, type Network } from '../../core/network';
import { Horizontal, Vertical } from '../ui/stack';

const fieldMap = [
    { key: 'Name', numeric: false },
    { key: 'Rpc', numeric: false },
    { key: 'ChainId', numeric: true },
    { key: 'Symbol', numeric: false },
    { key: 'Explorer', numeric: false },
    { key: 'Api', numeric: false },
    { key: 'ApiKey', numeric: false }
] as const;

export default function DashboardNetwork({ network, onChange, onClose }: { network: Network; onChange: () => void; onClose: () => void }) {
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState('');
    const [draft, setDraft] = useState({ Name: '', Rpc: '', ChainId: '', Symbol: '', Explorer: '', Api: '', ApiKey: '' });

    const [networks, setNetworks] = useState(getNetworks);

    const onSelect = async (id: string) => {
        await setNetwork(id);

        onChange();
        onClose();
    };

    const onRemove = async (id: string) => {
        await removeNetwork(id);

        setNetworks(getNetworks());

        onChange();
    };

    const onAdd = async () => {
        const chain = Number(draft.ChainId);

        const endpoints = draft.Rpc.split(/[\s,]+/u)
            .map((url) => url.trim())
            .filter((url) => url.length > 0);

        if (draft.Name.trim().length === 0 || draft.Symbol.trim().length === 0) {
            setError(T('Dashboard.Network.Invalid'));

            return;
        }

        if (endpoints.length === 0 || endpoints.some((url) => !url.startsWith('http'))) {
            setError(T('Dashboard.Network.InvalidRpc'));

            return;
        }

        if (!Number.isInteger(chain) || chain <= 0) {
            setError(T('Dashboard.Network.InvalidChainId'));

            return;
        }

        await addNetwork({
            name: draft.Name.trim(),
            symbol: draft.Symbol.trim().toUpperCase(),
            rpcUrl: endpoints[0],
            ...(endpoints.length > 1 ? { rpcBackups: endpoints.slice(1) } : {}),
            explorerUrl: draft.Explorer.trim(),
            ...(draft.Api.trim().length > 0 ? { explorerApi: draft.Api.trim() } : {}),
            ...(draft.ApiKey.trim().length > 0 ? { explorerKey: draft.ApiKey.trim() } : {}),
            chainId: chain,
            decimals: 18
        });

        onChange();
        onClose();
    };

    return (
        <Modal scroll onClose={onClose} panelClass='gap-2'>
            <ModalHeader title={T('Dashboard.Network.Title')} onClose={onClose} />

            {adding ? (
                <Vertical className='gap-2'>
                    <Alert text={error} />

                    {fieldMap.map((item) => (
                        <TextField
                            key={item.key}
                            value={draft[item.key]}
                            dir={item.key === 'Name' ? undefined : 'ltr'}
                            inputMode={item.numeric ? 'numeric' : undefined}
                            aria-label={T(`Dashboard.Network.${item.key}`)}
                            placeholder={T(`Dashboard.Network.${item.key}`)}
                            onValue={(value) => {
                                setDraft((current) => ({ ...current, [item.key]: value }));
                            }}
                            className='text-center'
                        />
                    ))}

                    <ModalActions>
                        <Button
                            variant='muted'
                            size='action'
                            onClick={() => {
                                setAdding(false);
                                setError('');
                            }}
                            text={T('Dashboard.Network.Back')}
                        />

                        <Button
                            variant='primary'
                            size='action'
                            onClick={() => {
                                void onAdd();
                            }}
                            text={T('Dashboard.Network.Save')}
                        />
                    </ModalActions>
                </Vertical>
            ) : (
                <>
                    <ModalBody className='gap-2'>
                        {networks.map((item) => {
                            const isActive = item.id === network.id;

                            return (
                                <Horizontal key={item.id} className='items-center gap-1'>
                                    <MenuRow
                                        selected={isActive}
                                        label={item.name}
                                        className='min-w-0 flex-1'
                                        leading={
                                            <TokenIcon
                                                primary
                                                kind='network'
                                                src={getNativeLogo(item.chainId)}
                                                symbol={item.symbol}
                                                className='size-7 text-tiny'
                                            />
                                        }
                                        trailing={isActive ? <FiCheck size={18} /> : undefined}
                                        onClick={() => {
                                            void onSelect(item.id);
                                        }}
                                    />

                                    {item.custom && (
                                        <Button
                                            variant='danger'
                                            size='iconChip'
                                            aria-label={T('Dashboard.Network.Remove')}
                                            onClick={() => {
                                                void onRemove(item.id);
                                            }}
                                        >
                                            <FiTrash2 size={16} />
                                        </Button>
                                    )}
                                </Horizontal>
                            );
                        })}
                    </ModalBody>

                    <ModalActions>
                        <Button
                            variant='normal'
                            size='action'
                            onClick={() => {
                                setAdding(true);
                            }}
                            leftIcon={<FiPlus size={16} />}
                            text={T('Dashboard.Network.Add')}
                        />
                    </ModalActions>
                </>
            )}
        </Modal>
    );
}
