import { useState } from 'react';
import { motion } from 'motion/react';
import { IoClose } from 'react-icons/io5';
import { FiCheck, FiPlus, FiTrash2 } from 'react-icons/fi';

import { T } from '../utility/language';
import { addNetwork, getNetworks, removeNetwork, setNetwork, type Network } from '../core/network';

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

    const onSelect = async(id: string) =>
    {
        await setNetwork(id);

        onChange();
        onClose();
    };

    const onRemove = async(id: string) =>
    {
        await removeNetwork(id);

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
        <>
            <motion.div
                initial={ { opacity: 0 } }
                animate={ { opacity: 1 } }
                exit={ { opacity: 0 } }
                className='absolute z-30 size-full cursor-pointer bg-black/25 backdrop-blur-xs'
                onClick={ onClose } />

            <div className='absolute inset-0 z-30 m-auto flex size-fit items-center justify-center'>

                <motion.div
                    initial={ { opacity: 0, scale: 0.9 } }
                    animate={ { opacity: 1, scale: 1 } }
                    exit={ { opacity: 0, scale: 0.9 } }
                    className='glass-panel flex max-h-[80vh] w-80 flex-col gap-2 overflow-y-auto rounded-2xl p-4'>

                    <div className='flex items-center justify-between'>

                        <div className='text-medium font-bold text-txt-normal'>

                            { T('Dashboard.Network.Title') }

                        </div>

                        <button
                            type='button'
                            onClick={ onClose }
                            className='btn-muted flex size-8 items-center justify-center rounded-lg'>

                            <IoClose size={ 20 } />

                        </button>

                    </div>

                    {
                        adding ?
                            (
                                <div className='flex flex-col gap-2'>

                                    {
                                        error.length > 0 &&
                                        (
                                            <div className='rounded-lg bg-txt-error/15 px-3 py-2 text-center text-tiny text-txt-error'>

                                                { error }

                                            </div>
                                        )
                                    }

                                    <input
                                        value={ name }
                                        placeholder={ T('Dashboard.Network.Name') }
                                        onChange={ (event) => { setName(event.target.value); } }
                                        className='glass-input h-11 w-full rounded-xl px-3 text-small' />

                                    <input
                                        value={ rpcUrl }
                                        dir='ltr'
                                        placeholder={ T('Dashboard.Network.Rpc') }
                                        onChange={ (event) => { setRpcUrl(event.target.value); } }
                                        className='glass-input h-11 w-full rounded-xl px-3 text-small' />

                                    <input
                                        value={ chainId }
                                        dir='ltr'
                                        inputMode='numeric'
                                        placeholder={ T('Dashboard.Network.ChainId') }
                                        onChange={ (event) => { setChainId(event.target.value); } }
                                        className='glass-input h-11 w-full rounded-xl px-3 text-small' />

                                    <input
                                        value={ symbol }
                                        placeholder={ T('Dashboard.Network.Symbol') }
                                        onChange={ (event) => { setSymbol(event.target.value); } }
                                        className='glass-input h-11 w-full rounded-xl px-3 text-small' />

                                    <input
                                        value={ explorerUrl }
                                        dir='ltr'
                                        placeholder={ T('Dashboard.Network.Explorer') }
                                        onChange={ (event) => { setExplorerUrl(event.target.value); } }
                                        className='glass-input h-11 w-full rounded-xl px-3 text-small' />

                                    <div className='mt-1 flex gap-2'>

                                        <button
                                            type='button'
                                            onClick={ () => { setAdding(false); setError(''); } }
                                            className='btn-muted h-11 flex-1 rounded-xl text-small'>

                                            { T('Dashboard.Network.Back') }

                                        </button>

                                        <button
                                            type='button'
                                            onClick={ () => { void onAdd(); } }
                                            className='btn-primary h-11 flex-1 rounded-xl text-small'>

                                            { T('Dashboard.Network.Save') }

                                        </button>

                                    </div>

                                </div>
                            ) :
                            (
                                <>
                                    {
                                        getNetworks().map((item) =>
                                        {
                                            const isActive = item.id === network.id;

                                            return (
                                                <div
                                                    key={ item.id }
                                                    className='flex items-center gap-1'>

                                                    <button
                                                        type='button'
                                                        onClick={ () => { void onSelect(item.id); } }
                                                        className={ `btn-muted flex h-12 flex-1 items-center gap-2 rounded-xl px-3 text-start ${ isActive ? 'cursor-default!' : '' }` }>

                                                        <div className='flex size-7 items-center justify-center rounded-full bg-btn-primary text-tiny text-txt-reverse'>

                                                            { item.symbol.slice(0, 1) }

                                                        </div>

                                                        <div className='flex-1 text-small text-txt-normal'>

                                                            { item.name }

                                                        </div>

                                                        {
                                                            isActive && <FiCheck size={ 18 } />
                                                        }

                                                    </button>

                                                    {
                                                        item.custom &&
                                                        (
                                                            <button
                                                                type='button'
                                                                onClick={ () => { void onRemove(item.id); } }
                                                                className='btn-muted flex size-9 items-center justify-center rounded-xl text-txt-error'>

                                                                <FiTrash2 size={ 16 } />

                                                            </button>
                                                        )
                                                    }

                                                </div>
                                            );
                                        })
                                    }

                                    <button
                                        type='button'
                                        onClick={ () => { setAdding(true); } }
                                        className='btn-normal mt-1 flex h-11 items-center justify-center gap-2 rounded-xl text-small'>

                                        <FiPlus size={ 16 } />

                                        { T('Dashboard.Network.Add') }

                                    </button>
                                </>
                            )
                    }

                </motion.div>

            </div>
        </>
    );
}
