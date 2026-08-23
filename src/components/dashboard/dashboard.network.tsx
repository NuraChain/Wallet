import { useState } from 'react';
import { FiCheck, FiPlus, FiTrash2 } from 'react-icons/fi';

import TokenIcon from '../token.icon';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Button from '../ui/button';
import { TextField } from '../ui/field';
import { Modal, ModalActions, ModalBody, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { getNativeLogo } from '../../core/price';
import { addNetwork, getNetworks, removeNetwork, setNetwork, type Network } from '../../core/network';
import { Horizontal, Vertical } from '../ui/stack';

/**
 * The custom-network form. Every field is a plain text input that only differs by its placeholder and
 * where the typed value lands, so the form is a list rather than five copies of one input.
 *
 * `numeric` marks the chain id, the only field that wants a number pad on a phone.
 */
const fieldMap =
[
    { key: 'Name', numeric: false },
    { key: 'Rpc', numeric: false },
    { key: 'ChainId', numeric: true },
    { key: 'Symbol', numeric: false },
    { key: 'Explorer', numeric: false },
    { key: 'Api', numeric: false },
    { key: 'ApiKey', numeric: false }
] as const;

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
    const [ draft, setDraft ] = useState({ Name: '', Rpc: '', ChainId: '', Symbol: '', Explorer: '', Api: '', ApiKey: '' });

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
        const chain = Number(draft.ChainId);

        // One field, any number of endpoints: a public RPC is the part of a network most likely to
        // stop answering, so the form takes a list separated by whatever the user reached for.
        const endpoints = draft.Rpc.split(/[\s,]+/u).map((url) => url.trim()).filter((url) => url.length > 0);

        if (draft.Name.trim().length === 0 || draft.Symbol.trim().length === 0)
        {
            setError(T('Dashboard.Network.Invalid'));

            return;
        }

        if (endpoints.length === 0 || endpoints.some((url) => !url.startsWith('http')))
        {
            setError(T('Dashboard.Network.InvalidRpc'));

            return;
        }

        if (!Number.isInteger(chain) || chain <= 0)
        {
            setError(T('Dashboard.Network.InvalidChainId'));

            return;
        }

        // Both optional, and both only worth sending when filled: an empty `explorerApi` has to stay
        // absent so the address is still guessed from the explorer URL, which is what every network
        // added before these two fields existed relies on.
        await addNetwork({
            name: draft.Name.trim(),
            symbol: draft.Symbol.trim().toUpperCase(),
            rpcUrl: endpoints[0],
            ...endpoints.length > 1 ? { rpcBackups: endpoints.slice(1) } : {},
            explorerUrl: draft.Explorer.trim(),
            ...draft.Api.trim().length > 0 ? { explorerApi: draft.Api.trim() } : {},
            ...draft.ApiKey.trim().length > 0 ? { explorerKey: draft.ApiKey.trim() } : {},
            chainId: chain,
            decimals: 18
        });

        onChange();
        onClose();
    };

    return (
        <Modal
            scroll
            onClose={ onClose }
            panelClass='gap-2'>

            <ModalHeader
                title={ T('Dashboard.Network.Title') }
                onClose={ onClose } />

            {
                adding ?
                    (
                        <Vertical className='gap-2'>

                            <Alert text={ error } />

                            {
                                fieldMap.map((item) => (
                                    <TextField
                                        key={ item.key }
                                        value={ draft[item.key] }
                                        // A URL, a chain id and a ticker are all left-to-right, so
                                        // they are typed `ltr` whatever the interface language is.
                                        // Centring is what makes that bearable: aligned to the start,
                                        // the Persian placeholder sat on one side of the field and the
                                        // value the user typed appeared on the other, so the text
                                        // jumped across the box on the first keystroke. Centred, the
                                        // hint and the value occupy the same place and only the
                                        // ordering inside the string is left to `dir`.
                                        dir={ item.key === 'Name' ? undefined : 'ltr' }
                                        inputMode={ item.numeric ? 'numeric' : undefined }
                                        placeholder={ T(`Dashboard.Network.${ item.key }`) }
                                        onValue={ (value) => { setDraft((current) => ({ ...current, [item.key]: value })); } }
                                        className='text-center' />
                                ))
                            }

                            <ModalActions>

                                <Button
                                    variant='muted'
                                    size='action'
                                    onClick={ () => { setAdding(false); setError(''); } }
                                    text={ T('Dashboard.Network.Back') } />

                                <Button
                                    variant='primary'
                                    size='action'
                                    onClick={ () => { void onAdd(); } }
                                    text={ T('Dashboard.Network.Save') } />

                            </ModalActions>

                        </Vertical>
                    ) :
                    (
                        <>
                            <ModalBody className='gap-2'>

                                {
                                    networks.map((item) =>
                                    {
                                        const isActive = item.id === network.id;

                                        return (
                                            <Horizontal
                                                key={ item.id }
                                                className='items-center gap-1'>

                                                <Button
                                                    variant='muted'
                                                    onClick={ () => { void onSelect(item.id); } }
                                                    className={ `h-12 flex-1 rounded-surface px-3 text-start ${ isActive ? 'cursor-default!' : '' }` }>

                                                    { /*
                                                      * The same coin logo the wallet tab shows for the
                                                      * active network, so the row and the chip that
                                                      * opens it are the same thing. A custom network has
                                                      * no logo to fetch, and `TokenIcon` falls back to
                                                      * the lettered disc this row drew before.
                                                      */ }
                                                    <TokenIcon
                                                        primary
                                                        kind='network'
                                                        src={ getNativeLogo(item.chainId) }
                                                        symbol={ item.symbol }
                                                        className='size-7 text-tiny' />

                                                    <Text
                                                        variant='body'
                                                        className='flex-1'
                                                        text={ item.name } />

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
                                                            aria-label={ T('Dashboard.Network.Remove') }
                                                            onClick={ () => { void onRemove(item.id); } }>

                                                            <FiTrash2 size={ 16 } />

                                                        </Button>
                                                    )
                                                }

                                            </Horizontal>
                                        );
                                    })
                                }

                            </ModalBody>

                            <ModalActions>

                                <Button
                                    variant='normal'
                                    size='action'
                                    onClick={ () => { setAdding(true); } }
                                    leftIcon={ <FiPlus size={ 16 } /> }
                                    text={ T('Dashboard.Network.Add') } />

                            </ModalActions>
                        </>
                    )
            }

        </Modal>
    );
}
