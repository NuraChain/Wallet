import { useState } from 'react';
import { FiCheck, FiPlus, FiTrash2 } from 'react-icons/fi';

import Alert from '../ui/alert';
import Button from '../ui/button';
import IconBox from '../ui/iconbox';
import { TextField } from '../ui/field';
import { Modal, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { addNetwork, getNetworks, removeNetwork, setNetwork, type Network } from '../../core/network';

/**
 * DashboardNetwork - Network picker and custom-network editor.
 *
 * Lists every known network for selection, and hosts a small form to add a custom EVM network. Built-in networks cannot be removed.
 * @param {object} props Component props.
 * @param {Network} props.network The active network.
 * @param {() => void} props.onChange Notifies the parent that the active network or list changed.
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The network modal.
 */
export default function DashboardNetwork({ network, onChange, onClose }: { network: Network; onChange: () => void; onClose: () => void })
{
    const [ adding, setAdding ] = useState(false);
    const [ error, setError ] = useState('');
    const [ name, setName ] = useState('');
    const [ rpcUrl, setRpcUrl ] = useState('');
    const [ chainId, setChainId ] = useState('');
    const [ symbol, setSymbol ] = useState('');
    const [ explorerUrl, setExplorerUrl ] = useState('');

    // The network list is module state, not React state, so mutating it does not re-render anything
    // on its own. Notifying the parent is not enough either: it only tracks the *active* network, and
    // removing an inactive one leaves `getNetwork()` returning the very same object, which React
    // treats as no change at all — so the deleted row stayed on screen. Keeping a local copy makes
    // this list re-render because the list changed, which is the thing that actually changed.
    const [ networks, setNetworks ] = useState(getNetworks);

    const onSelect = async(id: string) =>
    {
        await setNetwork(id);

        onChange();
        onClose();
    };

    const onRemove = async(id: string) =>
    {
        await removeNetwork(id);

        setNetworks(getNetworks());

        onChange();
    };

    const onAdd = async() =>
    {
        const chain = Number(chainId);

        if (name.trim().length === 0 || symbol.trim().length === 0)
        {
            setError(T('Dashboard.Network.Invalid'));

            return;
        }

        if (!rpcUrl.startsWith('http'))
        {
            setError(T('Dashboard.Network.InvalidRpc'));

            return;
        }

        if (!Number.isInteger(chain) || chain <= 0)
        {
            setError(T('Dashboard.Network.InvalidChainId'));

            return;
        }

        await addNetwork({ name: name.trim(), symbol: symbol.trim().toUpperCase(), rpcUrl: rpcUrl.trim(), explorerUrl: explorerUrl.trim(), chainId: chain, decimals: 18 });

        onChange();
        onClose();
    };

    return (
        <Modal
            onClose={ onClose }
            panelClass='max-h-[80vh] gap-2 overflow-y-auto'>

            <ModalHeader
                title={ T('Dashboard.Network.Title') }
                onClose={ onClose } />

            {
                adding ?
                    (
                        <div className='flex flex-col gap-2'>

                            {
                                error.length > 0 &&
                                (
                                    <Alert>

                                        { error }

                                    </Alert>
                                )
                            }

                            <TextField
                                value={ name }
                                placeholder={ T('Dashboard.Network.Name') }
                                onValue={ setName } />

                            <TextField
                                value={ rpcUrl }
                                dir={ rpcUrl.length > 0 ? 'ltr' : undefined }
                                placeholder={ T('Dashboard.Network.Rpc') }
                                onValue={ setRpcUrl } />

                            <TextField
                                value={ chainId }
                                dir={ chainId.length > 0 ? 'ltr' : undefined }
                                inputMode='numeric'
                                placeholder={ T('Dashboard.Network.ChainId') }
                                onValue={ setChainId } />

                            <TextField
                                value={ symbol }
                                dir={ symbol.length > 0 ? 'ltr' : undefined }
                                placeholder={ T('Dashboard.Network.Symbol') }
                                onValue={ setSymbol } />

                            <TextField
                                value={ explorerUrl }
                                dir={ explorerUrl.length > 0 ? 'ltr' : undefined }
                                placeholder={ T('Dashboard.Network.Explorer') }
                                onValue={ setExplorerUrl } />

                            <div className='mt-1 flex gap-2'>

                                <Button
                                    variant='muted'
                                    size='action'
                                    onClick={ () => { setAdding(false); setError(''); } }
                                    className='flex-1'
                                    text={ T('Dashboard.Network.Back') } />

                                <Button
                                    variant='primary'
                                    size='action'
                                    onClick={ () => { void onAdd(); } }
                                    className='flex-1'
                                    text={ T('Dashboard.Network.Save') } />

                            </div>

                        </div>
                    ) :
                    (
                        <>
                            {
                                networks.map((item) =>
                                {
                                    const isActive = item.id === network.id;

                                    return (
                                        <div
                                            key={ item.id }
                                            className='flex items-center gap-1'>

                                            <Button
                                                variant='muted'
                                                onClick={ () => { void onSelect(item.id); } }
                                                className={ `h-12 flex-1 rounded-xl px-3 text-start ${ isActive ? 'cursor-default!' : '' }` }>

                                                <IconBox tone='primary' size='size-7' className='text-tiny'>

                                                    { item.symbol.slice(0, 1) }

                                                </IconBox>

                                                <div className='flex-1 text-small text-txt-normal'>

                                                    { item.name }

                                                </div>

                                                {
                                                    isActive && <FiCheck size={ 18 } />
                                                }

                                            </Button>

                                            {
                                                item.custom &&
                                                (
                                                    <Button
                                                        variant='danger'
                                                        size='iconChip'
                                                        onClick={ () => { void onRemove(item.id); } }>

                                                        <FiTrash2 size={ 16 } />

                                                    </Button>
                                                )
                                            }

                                        </div>
                                    );
                                })
                            }

                            <Button
                                variant='normal'
                                size='action'
                                onClick={ () => { setAdding(true); } }
                                className='mt-1'>

                                <FiPlus size={ 16 } />

                                { T('Dashboard.Network.Add') }

                            </Button>
                        </>
                    )
            }

        </Modal>
    );
}
