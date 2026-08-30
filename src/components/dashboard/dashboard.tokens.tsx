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

export default function DashboardTokens({
    network,
    tokens,
    prices,
    onAdd,
    onRemove,
    onClose
}: {
    network: Network;
    tokens: TokenBalance[];
    prices: PriceMap;
    onAdd: (address: string) => Promise<string>;
    onRemove: (address: string) => void;
    onClose: () => void;
}) {
    const [adding, setAdding] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [contract, setContract] = useState('');

    const rowValue = (item: TokenBalance) => {
        const price = prices[getTokenCoinId(network.chainId, item.token.address, item.token.coinId)];

        return price === undefined ? undefined : formatUsd(Number(item.formatted) * price);
    };

    const onSave = async () => {
        const value = contract.trim();

        if (value.length === 0) {
            setError(T('Dashboard.Tokens.InvalidAddress'));

            return;
        }

        setBusy(true);
        setError('');

        const message = await onAdd(value);

        setBusy(false);

        if (message.length > 0) {
            setError(message);

            return;
        }

        setContract('');
        setAdding(false);
    };

    return (
        <Modal scroll onClose={onClose}>
            <ModalHeader title={T('Dashboard.Tokens.ManageTitle')} onClose={onClose} />

            {adding ? (
                <Vertical className='gap-2'>
                    <Alert text={error} />

                    <Text text={T('Dashboard.Tokens.ContractHint')} />

                    <TextField
                        dir='ltr'
                        value={contract}
                        spellCheck={false}
                        autoComplete='off'
                        label={T('Dashboard.Tokens.Contract')}
                        placeholder='0x…'
                        onValue={setContract}
                        className='font-mono'
                    />

                    <ModalActions>
                        <Button
                            dim
                            variant='muted'
                            size='action'
                            disabled={busy}
                            onClick={() => {
                                setAdding(false);
                                setError('');
                            }}
                            text={T('Dashboard.Tokens.Back')}
                        />

                        <Button
                            dim
                            variant='primary'
                            size='action'
                            loading={busy}
                            onClick={() => {
                                void onSave();
                            }}
                            text={busy ? T('Dashboard.Tokens.Checking') : T('Dashboard.Tokens.Save')}
                        />
                    </ModalActions>
                </Vertical>
            ) : (
                <>
                    {tokens.length > 0 && (
                        <ListCard>
                            {tokens.map((item) => (
                                <TokenRow
                                    grouped
                                    hover
                                    kind='token'
                                    key={item.token.address}
                                    src={getTokenLogo(network.chainId, item.token.address)}
                                    symbol={item.token.symbol}
                                    subtitle={item.token.name}
                                >
                                    <AssetAmount amount={trimAmount(item.formatted)} value={rowValue(item)} />

                                    <Button
                                        variant='danger'
                                        size='icon'
                                        onClick={() => {
                                            onRemove(item.token.address);
                                        }}
                                        aria-label={T('Dashboard.Tokens.Remove')}
                                        className='shrink-0'
                                    >
                                        <FiTrash2 size={16} />
                                    </Button>
                                </TokenRow>
                            ))}
                        </ListCard>
                    )}

                    {tokens.length === 0 && <StatusBlock text={T('Dashboard.Tokens.Empty')} />}

                    <Button
                        variant='normal'
                        size='action'
                        onClick={() => {
                            setAdding(true);
                            setError('');
                        }}
                        className='mt-1'
                        leftIcon={<FiPlus size={16} />}
                        text={T('Dashboard.Tokens.Add')}
                    />
                </>
            )}
        </Modal>
    );
}
