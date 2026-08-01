import type { Network } from '../../core/network';
import type { TokenBalance } from '../../core/token';

import { useState } from 'react';
import { FiPlus, FiTrash2 } from 'react-icons/fi';

import TokenRow from '../token.row';

import Alert from '../ui/alert';
import Button from '../ui/button';
import { TextField } from '../ui/field';
import { Modal, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { getTokenLogo } from '../../core/price';
import { trimAmount } from '../../utility/format';

/**
 * DashboardTokens - The token list the wallet tab reads from, plus the form that fills it.
 *
 * The wallet ships with no ERC20s: every row here was added by the user pasting a contract address. The symbol, name and decimals are read off the contract itself, so the only thing to type is the address.
 *
 * Removing a token only stops tracking it — the balance stays on chain and comes back if the same contract is added again.
 * @param {object} props Component props.
 * @param {Network} props.network The active network.
 * @param {TokenBalance[]} props.tokens Tracked tokens with their balances.
 * @param {(address: string) => Promise<string>} props.onAdd Adds a contract, resolving to an error message or an empty string on success.
 * @param {(address: string) => void} props.onRemove Stops tracking one contract.
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The token manager modal.
 */
export default function DashboardTokens({ network, tokens, onAdd, onRemove, onClose }: { network: Network; tokens: TokenBalance[]; onAdd: (address: string) => Promise<string>; onRemove: (address: string) => void; onClose: () => void })
{
    const [ adding, setAdding ] = useState(false);
    const [ busy, setBusy ] = useState(false);
    const [ error, setError ] = useState('');
    const [ contract, setContract ] = useState('');

    const onSave = async() =>
    {
        const value = contract.trim();

        if (value.length === 0)
        {
            setError(T('Dashboard.Tokens.InvalidAddress'));

            return;
        }

        setBusy(true);
        setError('');

        const message = await onAdd(value);

        setBusy(false);

        if (message.length > 0)
        {
            setError(message);

            return;
        }

        setContract('');
        setAdding(false);
    };

    return (
        <Modal
            onClose={ onClose }
            panelClass='max-h-[80vh] max-w-[calc(100vw-2rem)] overflow-y-auto'>

            <ModalHeader
                title={ T('Dashboard.Tokens.ManageTitle') }
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

                            <div className='text-tiny text-txt-muted'>

                                { T('Dashboard.Tokens.ContractHint') }

                            </div>

                            <TextField
                                dir='ltr'
                                value={ contract }
                                spellCheck={ false }
                                autoComplete='off'
                                placeholder='0x…'
                                onValue={ setContract }
                                className='font-mono' />

                            <div className='mt-1 flex gap-2'>

                                <Button
                                    variant='muted'
                                    size='action'
                                    disabled={ busy }
                                    onClick={ () => { setAdding(false); setError(''); } }
                                    className='flex-1'
                                    text={ T('Dashboard.Tokens.Back') } />

                                <Button
                                    variant='primary'
                                    size='action'
                                    disabled={ busy }
                                    onClick={ () => { void onSave(); } }
                                    className='flex-1'
                                    text={ busy ? T('Dashboard.Tokens.Checking') : T('Dashboard.Tokens.Save') } />

                            </div>

                        </div>
                    ) :
                    (
                        <>
                            {
                                tokens.map((item) => (
                                    <TokenRow
                                        key={ item.token.address }
                                        src={ getTokenLogo(network.chainId, item.token.address) }
                                        symbol={ item.token.symbol }
                                        subtitle={ item.token.name }>

                                        <div dir='ltr' className='font-mono text-tiny text-txt-normal'>

                                            { trimAmount(item.formatted) }

                                        </div>

                                        <Button
                                            variant='danger'
                                            size='icon'
                                            onClick={ () => { onRemove(item.token.address); } }
                                            aria-label={ T('Dashboard.Tokens.Remove') }
                                            className='shrink-0'>

                                            <FiTrash2 size={ 16 } />

                                        </Button>

                                    </TokenRow>
                                ))
                            }

                            {
                                tokens.length === 0 &&
                                (
                                    <div className='py-4 text-center text-tiny text-txt-muted'>

                                        { T('Dashboard.Tokens.Empty') }

                                    </div>
                                )
                            }

                            <Button
                                variant='normal'
                                size='action'
                                onClick={ () => { setAdding(true); setError(''); } }
                                className='mt-1'>

                                <FiPlus size={ 16 } />

                                { T('Dashboard.Tokens.Add') }

                            </Button>
                        </>
                    )
            }

        </Modal>
    );
}
