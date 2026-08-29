import type { Network } from '../../core/network';
import type { TokenBalance } from '../../core/token';

import { useState } from 'react';
import { FiPlus, FiTrash2 } from 'react-icons/fi';

import TokenRow, { AssetAmount } from '../token.row';

import Text from '../ui/text';
import StatusBlock from '../ui/state';
import Alert from '../ui/alert';
import Button from '../ui/button';
import ListCard from '../ui/list';
import { TextField } from '../ui/field';
import { Modal, ModalActions, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { getTokenCoinId, getTokenLogo, type PriceMap } from '../../core/price';
import { formatUsd, trimAmount } from '../../utility/format';
import { Vertical } from '../ui/stack';

/**
 * DashboardTokens - The token list the wallet tab reads from, plus the form that fills it.
 *
 * The wallet ships with no ERC20s: every row here was added by the user pasting a contract address. The symbol, name and decimals are read off the contract itself, so the only thing to type is the address.
 *
 * Removing a token only stops tracking it — the balance stays on chain and comes back if the same contract is added again.
 * @param {object} props Component props.
 * @param {Network} props.network The active network.
 * @param {TokenBalance[]} props.tokens Tracked tokens with their balances.
 * @param {PriceMap} props.prices USD price per pricing id, so each row can say what its balance is worth.
 * @param {(address: string) => Promise<string>} props.onAdd Adds a contract, resolving to an error message or an empty string on success.
 * @param {(address: string) => void} props.onRemove Stops tracking one contract.
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The token manager modal.
 */
export default function DashboardTokens({ network, tokens, prices, onAdd, onRemove, onClose }: { network: Network; tokens: TokenBalance[]; prices: PriceMap; onAdd: (address: string) => Promise<string>; onRemove: (address: string) => void; onClose: () => void })
{
    const [ adding, setAdding ] = useState(false);
    const [ busy, setBusy ] = useState(false);
    const [ error, setError ] = useState('');
    const [ contract, setContract ] = useState('');

    /**
     * rowValue - USD worth of one tracked token, or nothing when it cannot be priced.
     *
     * The same rule the wallet tab holds to: a token the price sources have never heard of shows its
     * balance and no second line, rather than a `$0.00` that reads as a worthless holding.
     * @param {TokenBalance} item The token and its balance.
     * @returns {string | undefined} The formatted USD value, or `undefined`.
     */
    const rowValue = (item: TokenBalance) =>
    {
        const price = prices[getTokenCoinId(network.chainId, item.token.address, item.token.coinId)];

        return price === undefined ? undefined : formatUsd(Number(item.formatted) * price);
    };

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
            scroll
            onClose={ onClose }>

            <ModalHeader
                title={ T('Dashboard.Tokens.ManageTitle') }
                onClose={ onClose } />

            {
                adding ?
                    (
                        <Vertical className='gap-2'>

                            <Alert text={ error } />

                            <Text text={ T('Dashboard.Tokens.ContractHint') } />

                            <TextField
                                dir='ltr'
                                value={ contract }
                                spellCheck={ false }
                                autoComplete='off'
                                label={ T('Dashboard.Tokens.Contract') }
                                placeholder='0x…'
                                onValue={ setContract }
                                className='font-mono' />

                            <ModalActions>

                                <Button
                                    dim
                                    variant='muted'
                                    size='action'
                                    disabled={ busy }
                                    onClick={ () => { setAdding(false); setError(''); } }
                                    text={ T('Dashboard.Tokens.Back') } />

                                { /*
                                  * The only busy form in the app that showed nothing but a swapped
                                  * label: no spinner, no fade. `loading` carries both, and disables.
                                  */ }
                                <Button
                                    dim
                                    variant='primary'
                                    size='action'
                                    loading={ busy }
                                    onClick={ () => { void onSave(); } }
                                    text={ busy ? T('Dashboard.Tokens.Checking') : T('Dashboard.Tokens.Save') } />

                            </ModalActions>

                        </Vertical>
                    ) :
                    (
                        <>
                            {
                                tokens.length > 0 &&
                                (
                                    <ListCard>

                                        {
                                            tokens.map((item) => (
                                                <TokenRow
                                                    grouped
                                                    hover
                                                    kind='token'
                                                    key={ item.token.address }
                                                    src={ getTokenLogo(network.chainId, item.token.address) }
                                                    symbol={ item.token.symbol }
                                                    subtitle={ item.token.name }>

                                                    <AssetAmount
                                                        amount={ trimAmount(item.formatted) }
                                                        value={ rowValue(item) } />

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

                                    </ListCard>
                                )
                            }

                            {
                                tokens.length === 0 &&
                                (
                                    <StatusBlock text={ T('Dashboard.Tokens.Empty') } />
                                )
                            }

                            <Button
                                variant='normal'
                                size='action'
                                onClick={ () => { setAdding(true); setError(''); } }
                                className='mt-1'
                                leftIcon={ <FiPlus size={ 16 } /> }
                                text={ T('Dashboard.Tokens.Add') } />
                        </>
                    )
            }

        </Modal>
    );
}
