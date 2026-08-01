import { useMemo, useState } from 'react';
import { FiCheck, FiEdit2, FiPlus } from 'react-icons/fi';

import WalletManager from '../../core/wallet';

import Alert from '../ui/alert';
import Button from '../ui/button';
import IconBox from '../ui/iconbox';
import { TextField } from '../ui/field';
import { Modal, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { shortAddress } from '../../utility/format';
import { accountLimit, defaultAccountName, type Account } from '../../utility/account';

/**
 * DashboardAccount - Account switcher: pick which derived account the dashboard is looking at, label them, and add more.
 *
 * Every account is a derivation index on the one mnemonic (`m/44'/60'/0'/0/{index}`), so adding one needs no extra key material — index 0 comes with the wallet and is always present, and any further index the user asks for is derived on the spot.
 *
 * The list shows only accounts that exist. Earlier it rendered every index up to the limit as an empty row waiting to be filled, which made the limit look like a quota and buried the real accounts among placeholders.
 * @param {object} props Component props.
 * @param {string} props.mnemonic The unlocked mnemonic, used to derive each account's address.
 * @param {Account[]} props.accounts The accounts created so far.
 * @param {number} props.active The active derivation index.
 * @param {(index: number) => void} props.onSelect Activates an index, creating the account if it is new.
 * @param {(index: number, name: string) => void} props.onRename Renames an account.
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The account modal.
 */
export default function DashboardAccount({ mnemonic, accounts, active, onSelect, onRename, onClose }: { mnemonic: string; accounts: Account[]; active: number; onSelect: (index: number) => void; onRename: (index: number, name: string) => void; onClose: () => void })
{
    const [ draft, setDraft ] = useState('');
    const [ editing, setEditing ] = useState(-1);
    const [ adding, setAdding ] = useState(false);
    const [ error, setError ] = useState('');
    const [ draftIndex, setDraftIndex ] = useState('');

    const addresses = useMemo(() =>
    {
        const map: Record<number, string> = {};

        for (const item of accounts)
        {
            map[item.index] = new WalletManager(mnemonic, item.index).retrieve().Public;
        }

        return map;
    }, [ mnemonic, accounts ]);

    /**
     * parseIndex - Reads the typed index, or `undefined` when it is not a usable one.
     * @param {string} value The raw input.
     * @returns {number | undefined} The index, or `undefined` when out of range or not an integer.
     */
    const parseIndex = (value: string) =>
    {
        const trimmed = value.trim();

        if (trimmed.length === 0)
        {
            return undefined;
        }

        const parsed = Number(trimmed);

        if (!Number.isInteger(parsed) || parsed < 0 || parsed >= accountLimit)
        {
            return undefined;
        }

        return parsed;
    };

    // Deriving the address as the index is typed lets the user confirm which account they are about
    // to add before it exists, which matters when the index is the only thing identifying it.
    const preview = useMemo(() =>
    {
        const index = parseIndex(draftIndex);

        return index === undefined ? '' : new WalletManager(mnemonic, index).retrieve().Public;
    }, [ mnemonic, draftIndex ]);

    const onEdit = (index: number, name: string) =>
    {
        setEditing(index);
        setDraft(name);
    };

    const onSave = () =>
    {
        const trimmed = draft.trim();

        if (trimmed.length > 0)
        {
            onRename(editing, trimmed);
        }

        setEditing(-1);
    };

    const onCreate = () =>
    {
        const index = parseIndex(draftIndex);

        if (index === undefined)
        {
            setError(T('Dashboard.Accounts.ErrorIndex', String(accountLimit - 1)));

            return;
        }

        if (accounts.some((item) => item.index === index))
        {
            setError(T('Dashboard.Accounts.ErrorExists'));

            return;
        }

        // Selecting an index the wallet has never opened is what creates it, so adding and switching
        // to the new account are the same call.
        onSelect(index);

        setAdding(false);
        setDraftIndex('');
        setError('');
    };

    return (
        <Modal
            onClose={ onClose }
            panelClass='max-h-[80vh] max-w-[calc(100vw-2rem)] overflow-y-auto'>

            <ModalHeader
                title={ T('Dashboard.Accounts.Title') }
                subtitle={ T('Dashboard.Accounts.Subtitle') }
                onClose={ onClose } />

            {
                adding ?
                    (
                        <div className='flex flex-col gap-2'>

                            {
                                error.length > 0 &&
                                (
                                    <Alert
                                        text={ error } />
                                )
                            }

                            <TextField
                                autoFocus
                                dir='ltr'
                                value={ draftIndex }
                                inputMode='numeric'
                                label={ T('Dashboard.Accounts.Index') }
                                placeholder={ T('Dashboard.Accounts.IndexHint') }
                                onValue={ setDraftIndex }
                                onEnter={ onCreate }
                                className='font-mono' />

                            <div className='text-tiny text-txt-muted'>

                                { T('Dashboard.Accounts.IndexNote') }

                            </div>

                            {
                                preview.length > 0 &&
                                (
                                    <div dir='ltr' className='glass-input flex min-h-11 items-center rounded-xl px-3 py-2 font-mono text-tiny break-all text-txt-muted'>

                                        { preview }

                                    </div>
                                )
                            }

                            <div className='mt-1 flex gap-2'>

                                <Button
                                    variant='muted'
                                    size='action'
                                    onClick={ () => { setAdding(false); setError(''); } }
                                    className='flex-1'
                                    text={ T('Dashboard.Accounts.Back') } />

                                <Button
                                    variant='primary'
                                    size='action'
                                    onClick={ onCreate }
                                    className='flex-1'
                                    text={ T('Dashboard.Accounts.Create') } />

                            </div>

                        </div>
                    ) :
                    (
                        <>
                            {
                                accounts.map((item) =>
                                {
                                    const isActive = item.index === active;
                                    const name = item.name.length > 0 ? item.name : defaultAccountName(item.index);

                                    if (editing === item.index)
                                    {
                                        return (
                                            <div
                                                key={ item.index }
                                                className='flex gap-2'>

                                                <div className='flex-1'>

                                                    <TextField
                                                        autoFocus
                                                        value={ draft }
                                                        placeholder={ name }
                                                        onValue={ setDraft }
                                                        onEnter={ onSave }
                                                        className='h-12' />

                                                </div>

                                                <Button
                                                    variant='primary'
                                                    onClick={ onSave }
                                                    className='h-12 rounded-xl px-4 text-small'
                                                    text={ T('Dashboard.Accounts.Save') } />

                                            </div>
                                        );
                                    }

                                    return (
                                        <div
                                            key={ item.index }
                                            className={ `flex items-center gap-2 rounded-xl p-2 duration-300 ${ isActive ? 'bg-btn-primary/15' : '' }` }>

                                            <Button
                                                onClick={ () => { onSelect(item.index); } }
                                                className='flex flex-1 cursor-pointer items-center gap-3 text-start'>

                                                <IconBox
                                                    tone={ isActive ? 'primary' : 'secondary' }
                                                    size='size-9'
                                                    className='text-small'>

                                                    { item.index }

                                                </IconBox>

                                                <div className='flex min-w-0 flex-1 flex-col'>

                                                    <div className='truncate text-small text-txt-normal'>

                                                        { name }

                                                    </div>

                                                    <div dir='ltr' className='font-mono text-tiny text-txt-muted'>

                                                        { shortAddress(addresses[item.index] ?? '') }

                                                    </div>

                                                </div>

                                                {
                                                    isActive &&
                                                    (
                                                        <FiCheck size={ 18 } className='shrink-0 text-txt-normal' />
                                                    )
                                                }

                                            </Button>

                                            <Button
                                                variant='muted'
                                                size='icon'
                                                aria-label={ T('Dashboard.Accounts.Rename') }
                                                onClick={ () => { onEdit(item.index, name); } }
                                                className='shrink-0'>

                                                <FiEdit2 size={ 14 } />

                                            </Button>

                                        </div>
                                    );
                                })
                            }

                            <Button
                                variant='normal'
                                size='action'
                                onClick={ () => { setAdding(true); setError(''); setDraftIndex(''); } }
                                className='mt-1'>

                                <FiPlus size={ 16 } />

                                { T('Dashboard.Accounts.Add') }

                            </Button>
                        </>
                    )
            }

        </Modal>
    );
}
