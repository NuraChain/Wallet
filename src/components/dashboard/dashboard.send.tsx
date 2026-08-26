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

interface Asset
{
    key: string;
    symbol: string;
    /** The longer name under the symbol — the coin's, or the token contract's. */
    name: string;
    /** Logo URL, handed to `TokenIcon`, which falls back to the symbol's initial. */
    logo: string;
    decimals: number;
    value: bigint;
    formatted: string;
    token?: { address: string; decimals: number };
}

/**
 * DashboardSend - Guided transfer flow for the native coin or a curated ERC20 token.
 *
 * The signing/broadcast step is reached only after an explicit review screen showing the recipient, amount, asset, and network. The signer is built from the vault in-memory for the single send and never persisted.
 *
 * Which asset is being sent is the first thing chosen. An account can hold several tokens on one network, and the coin was previously the only thing this screen would ever send — everything below the picker reads from the choice, and a token routes to its contract's `transfer` rather than to a plain value transfer.
 * @param {object} props Component props.
 * @param {Vault} props.vault The unlocked key material used to build the signer.
 * @param {number} props.index The active account's derivation index, so the transfer is signed by the account the user is looking at. Ignored for a private-key vault, which has only the one account.
 * @param {Network} props.network The active network.
 * @param {bigint} props.nativeValue Native balance in wei.
 * @param {string} props.nativeFormatted Native balance as a decimal string.
 * @param {TokenBalance[]} props.tokens Curated token balances.
 * @param {() => void} props.onSent Called after a successful broadcast so the parent can refresh balances.
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The send modal.
 */
export default function DashboardSend({ vault, index, network, nativeValue, nativeFormatted, tokens, onSent, onClose }: { vault: Vault; index: number; network: Network; nativeValue: bigint; nativeFormatted: string; tokens: TokenBalance[]; onSent: () => void; onClose: () => void })
{
    const assets = useMemo<Asset[]>(() => [
        { key: 'native', symbol: network.symbol, name: network.coin ?? network.name, logo: getNativeLogo(network.chainId), decimals: network.decimals, value: nativeValue, formatted: nativeFormatted },
        ...tokens.map((item) => ({ key: item.token.address, symbol: item.token.symbol, name: item.token.name, logo: getTokenLogo(network.chainId, item.token.address), decimals: item.token.decimals, value: item.value, formatted: item.formatted, token: { address: item.token.address, decimals: item.token.decimals } }))
    ], [ network, nativeValue, nativeFormatted, tokens ]);

    const [ step, setStep ] = useState<Step>('form');
    const [ error, setError ] = useState('');
    const [ failure, setFailure ] = useState('');
    const [ hash, setHash ] = useState('');
    const [ to, setTo ] = useState('');
    const [ amount, setAmount ] = useState('');
    const [ chosen, setChosen ] = useState('native');
    const [ picking, setPicking ] = useState(false);

    const online = useOnline();

    // Falls back to the coin rather than to nothing: the tracked list can lose a token while this
    // dialog is open — the holdings refresh behind it — and a send screen with no asset is not a state
    // worth having.
    const asset = assets.find((item) => item.key === chosen) ?? assets[0];

    /**
     * Switches which asset is being sent, and clears the amount.
     *
     * The amount is deliberately not carried over. Each asset has its own balance and its own decimals,
     * so the same digits mean a different transfer against a different one — leaving `5` in the box
     * while the asset under it changes from a stablecoin to the network's coin is the kind of thing
     * that gets signed before it is read.
     * @param {string} key The asset to switch to.
     */
    const onAsset = (key: string) =>
    {
        setChosen(key);
        setPicking(false);
        setAmount('');
        setError('');
    };

    /**
     * What the confirmation screen restates before anything is signed. Three label/value rows drawn
     * the same way, so they are listed rather than written out three times.
     */
    const reviewMap =
    [
        { label: T('Dashboard.Send.Amount'), value: `${ trimAmount(amount) } ${ asset.symbol }`, mono: true },
        { label: T('Dashboard.Send.To'), value: shortAddress(to), mono: true },
        { label: T('Dashboard.Network.Title'), value: network.name, mono: false }
    ];

    const onReview = () =>
    {
        if (!isAddress(to))
        {
            setError(T('Dashboard.Send.InvalidAddress'));

            return;
        }

        try
        {
            const parsed = parseUnits(amount || '0', asset.decimals);

            if (parsed <= 0n)
            {
                setError(T('Dashboard.Send.InvalidAmount'));

                return;
            }

            if (parsed > asset.value)
            {
                setError(T('Dashboard.Send.Insufficient'));

                return;
            }
        }
        catch
        {
            setError(T('Dashboard.Send.InvalidAmount'));

            return;
        }

        setError('');
        setStep('review');
    };

    const onConfirm = async() =>
    {
        // Signing is local, broadcasting is not, and a transaction that was never broadcast is a
        // failure worth naming: the generic "try again" sends the user back to a form that will fail
        // the same way until the connection returns.
        if (!online)
        {
            setFailure(T('Dashboard.Send.Offline'));
            setStep('error');

            return;
        }

        setStep('pending');

        try
        {
            const wallet = vaultManager(vault, index);
            const result = await wallet.send(getProvider(), { to, amount, token: asset.token });

            setHash(result);
            setStep('success');
            onSent();
        }
        catch
        {
            setFailure(T('Dashboard.Send.Error'));
            setStep('error');
        }
    };

    return (
        <Modal onClose={ onClose }>

            <ModalHeader
                title={ T('Dashboard.Send.Title') }
                titleClass='truncate'
                onClose={ onClose } />

            {
                step === 'form' &&
                (
                    <Vertical className='gap-3'>

                        <Alert text={ error } />

                        { /*
                          * Said up front rather than after the review: everything below this line is
                          * fillable offline and none of it can be sent, so the user should know before
                          * typing an address rather than at the moment they press confirm.
                          */ }
                        <Alert
                            variant='warning'
                            text={ online ? '' : T('Dashboard.Send.Offline') } />

                        { /*
                          * First, because it decides what everything under it means: the balance the
                          * Max control offers, the decimals the amount is parsed at, and whether this
                          * ends up a coin transfer or a call to a contract.
                          *
                          * Drawn as the same glass field the recipient is typed into, so the thing that
                          * opens a list reads as part of the form rather than as another button. The
                          * list itself is absolute: it lies over what follows instead of pushing the
                          * dialog taller as it opens.
                          */ }
                        <Vertical className='relative gap-1'>

                            <Text text={ T('Dashboard.Send.Asset') } />

                            <Button
                                aria-haspopup='listbox'
                                aria-expanded={ picking }
                                onClick={ () => { setPicking(!picking); } }
                                className={ cn(fieldSurface, 'flex h-14 w-full cursor-pointer items-center gap-3 rounded-surface px-3') }>

                                <TokenIcon
                                    primary={ asset.token === undefined }
                                    kind={ asset.token === undefined ? 'network' : 'token' }
                                    src={ asset.logo }
                                    symbol={ asset.symbol }
                                    className='size-9' />

                                <Vertical className='min-w-0 flex-1 text-start'>

                                    <Text variant='body' className='truncate' text={ asset.symbol } />

                                    <Text className='truncate' text={ asset.name } />

                                </Vertical>

                                <Text
                                    dir='ltr'
                                    variant='captionStrong'
                                    className='shrink-0 font-mono'
                                    text={ trimAmount(asset.formatted) } />

                                <IoChevronDown size={ 12 } className={ `shrink-0 opacity-40 transition-transform duration-(--duration-base) ${ picking ? 'rotate-180' : '' }` } />

                            </Button>

                            <Popover
                                role='listbox'
                                open={ picking }
                                onClose={ () => { setPicking(false); } }
                                className='scroll-hidden flex max-h-56 flex-col gap-1 overflow-y-auto'>

                                {
                                    assets.map((item) => (
                                        <Button
                                            key={ item.key }
                                            role='option'
                                            aria-selected={ item.key === asset.key }
                                            onClick={ () => { onAsset(item.key); } }
                                            className={ `flex w-full cursor-pointer items-center gap-3 rounded-control border border-transparent p-2 transition-colors duration-(--duration-fast) ${ item.key === asset.key ? selectedTint : 'hover:bg-btn-muted-hover' }` }>

                                            <TokenIcon
                                                primary={ item.token === undefined }
                                                kind={ item.token === undefined ? 'network' : 'token' }
                                                src={ item.logo }
                                                symbol={ item.symbol }
                                                className='size-8' />

                                            <Vertical className='min-w-0 flex-1 text-start'>

                                                <Text variant='body' className='truncate' text={ item.symbol } />

                                                <Text className='truncate' text={ item.name } />

                                            </Vertical>

                                            <Text
                                                dir='ltr'
                                                variant='captionStrong'
                                                className='shrink-0 font-mono'
                                                text={ trimAmount(item.formatted) } />

                                        </Button>
                                    ))
                                }

                            </Popover>

                        </Vertical>

                        <Vertical className='gap-1'>

                            { /*
                              * The label rides on the field rather than as a sibling heading, so the
                              * input is named to assistive technology by the same words that label it
                              * on screen — the two inputs of this form were announced unnamed.
                              */ }
                            <TextField
                                label={ T('Dashboard.Send.Recipient') }
                                value={ to }
                                dir='ltr'
                                placeholder='0x…'
                                onValue={ setTo }
                                className='font-mono' />

                        </Vertical>

                        <Vertical className='gap-1'>

                            <SectionHeader title={ T('Dashboard.Send.Amount') }>

                                <Button
                                    variant='muted'
                                    onClick={ () => { setAmount(asset.formatted); } }
                                    className='rounded-control px-2 py-0.5 text-tiny text-txt-muted'
                                    text={ T('Dashboard.Send.Max', trimAmount(asset.formatted)) } />

                            </SectionHeader>

                            { /*
                              * Named rather than labelled: the section header above carries the visible
                              * words and the Max control sits beside them, so the association is made
                              * for the reader of the accessibility tree instead of re-laying-out the row.
                              */ }
                            <TextField
                                value={ amount }
                                dir='ltr'
                                inputMode='decimal'
                                aria-label={ T('Dashboard.Send.Amount') }
                                placeholder='0.0'
                                onValue={ setAmount }
                                className='font-mono' />

                        </Vertical>

                        <Button
                            variant='primary'
                            size='action'
                            onClick={ onReview }
                            text={ T('Dashboard.Send.Review') } />

                    </Vertical>
                )
            }

            {
                step === 'review' &&
                (
                    <Vertical className='gap-3'>

                        <Panel className='flex flex-col gap-2'>

                            {
                                reviewMap.map((item) => (
                                    <Horizontal
                                        key={ item.label }
                                        className='items-center justify-between gap-2'>

                                        <Text text={ item.label } />

                                        { /*
                                          * `captionStrong` is the muted caption above at the same size
                                          * in the normal colour, which is the whole difference between
                                          * a label and its value here.
                                          */ }
                                        <Text
                                            variant='captionStrong'
                                            dir={ item.mono ? 'ltr' : undefined }
                                            className={ item.mono ? 'min-w-0 truncate font-mono' : 'min-w-0 truncate' }
                                            text={ item.value } />

                                    </Horizontal>
                                ))
                            }

                        </Panel>

                        <ModalActions className='mt-0'>

                            <Button
                                variant='muted'
                                size='action'
                                onClick={ () => { setStep('form'); } }
                                leftIcon={ <FiArrowLeft size={ 16 } className='rtl:rotate-180' /> }
                                text={ T('Dashboard.Send.Back') } />

                            <Button
                                variant='primary'
                                size='action'
                                onClick={ () => { void onConfirm(); } }
                                text={ T('Dashboard.Send.Confirm') } />

                        </ModalActions>

                    </Vertical>
                )
            }

            {
                step === 'pending' &&
                (
                    <Vertical className='items-center gap-3 py-6'>

                        <Spinner size={ 32 } className='text-txt-muted' />

                        <Text variant='bodyMuted' text={ T('Dashboard.Send.Pending') } />

                    </Vertical>
                )
            }

            {
                step === 'success' &&
                (
                    <Vertical className='items-center gap-3 py-4'>

                        <FiCheckCircle size={ 40 } className='text-txt-normal' />

                        <Text variant='body' text={ T('Dashboard.Send.Success') } />

                        { /* `text-tiny text-txt-muted` was this box spelling the caption pairing out by
                          * hand, so it comes from the variant now and the rest rides in beside it. */ }
                        <Text
                            dir='ltr'
                            className='w-full rounded-surface bg-base-3 p-2 text-center font-mono break-all select-text!'
                            text={ hash } />

                        <Button
                            variant='primary'
                            size='action'
                            fullWidth
                            onClick={ onClose }
                            text={ T('Dashboard.Send.Done') } />

                    </Vertical>
                )
            }

            {
                step === 'error' &&
                (
                    <Vertical className='items-center gap-3 py-4'>

                        { /*
                          * The highest-stakes error in a wallet, and it was the one rendered as bare
                          * red text — no tint, no radius, no padding, unannounced — in a file that
                          * already used `Alert` correctly twice a hundred lines above.
                          */ }
                        <Alert
                            size='comfortable'
                            className='w-full'
                            text={ failure.length > 0 ? failure : T('Dashboard.Send.Error') } />

                        <Button
                            variant='muted'
                            size='action'
                            fullWidth
                            onClick={ () => { setStep('form'); } }
                            text={ T('Dashboard.Send.Back') } />

                    </Vertical>
                )
            }

        </Modal>
    );
}
