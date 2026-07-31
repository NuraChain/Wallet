import { useMemo, useState } from 'react';
import { FiCheck, FiEdit2 } from 'react-icons/fi';

import WalletManager from '../../core/wallet';

import Button from '../ui/button';
import IconBox from '../ui/iconbox';
import { TextField } from '../ui/field';
import { Modal, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { shortAddress } from '../../utility/format';
import { accountLimit, defaultAccountName, type Account } from '../../utility/account';

/**
 * DashboardAccount - Account switcher: pick which derived account the dashboard is looking at, and label them.
 *
 * Every slot is just a derivation index on the one mnemonic (`m/44'/60'/0'/0/{index}`), so switching accounts needs no extra key material — the addresses below are derived on the spot for preview.
 *
 * A slot the user has never opened is created the moment they select it, which is why empty slots are still listed.
 * @param {object} props Component props.
 * @param {string} props.mnemonic The unlocked mnemonic, used to preview each slot's address.
 * @param {Account[]} props.accounts The accounts created so far.
 * @param {number} props.active The active derivation index.
 * @param {(index: number) => void} props.onSelect Activates a slot, creating it if needed.
 * @param {(index: number, name: string) => void} props.onRename Renames a slot.
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The account modal.
 */
export default function DashboardAccount({ mnemonic, accounts, active, onSelect, onRename, onClose }: { mnemonic: string; accounts: Account[]; active: number; onSelect: (index: number) => void; onRename: (index: number, name: string) => void; onClose: () => void })
{
    const [ draft, setDraft ] = useState('');
    const [ editing, setEditing ] = useState(-1);

    const addresses = useMemo(() => Array.from({ length: accountLimit }, (item, index) => new WalletManager(mnemonic, index).retrieve().Public), [ mnemonic ]);

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

    return (
        <Modal
            onClose={ onClose }
            panelClass='max-h-[80vh] max-w-[calc(100vw-2rem)] overflow-y-auto'>

            <ModalHeader
                title={ T('Dashboard.Accounts.Title') }
                subtitle={ T('Dashboard.Accounts.Subtitle') }
                onClose={ onClose } />

            {
                addresses.map((address, index) =>
                {
                    const account = accounts.find((item) => item.index === index);
                    const isActive = index === active;
                    const name = account?.name ?? defaultAccountName(index);

                    if (editing === index)
                    {
                        return (
                            <div
                                key={ address }
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
                                    className='h-12 rounded-xl px-4 text-small'>

                                    { T('Dashboard.Accounts.Save') }

                                </Button>

                            </div>
                        );
                    }

                    return (
                        <div
                            key={ address }
                            className={ `flex items-center gap-2 rounded-xl p-2 duration-300 ${ isActive ? 'bg-btn-primary/15' : '' }` }>

                            <Button
                                onClick={ () => { onSelect(index); } }
                                className='flex flex-1 cursor-pointer items-center gap-3 text-start'>

                                <IconBox
                                    tone={ isActive ? 'primary' : 'secondary' }
                                    size='size-9'
                                    className='text-small'>

                                    { index + 1 }

                                </IconBox>

                                <div className='flex min-w-0 flex-1 flex-col'>

                                    <div className='truncate text-small text-txt-normal'>

                                        { name }

                                    </div>

                                    <div dir='ltr' className='font-mono text-tiny text-txt-muted'>

                                        { account === undefined ? T('Dashboard.Accounts.Empty') : shortAddress(address) }

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
                                onClick={ () => { onEdit(index, name); } }
                                className='shrink-0'>

                                <FiEdit2 size={ 14 } />

                            </Button>

                        </div>
                    );
                })
            }

        </Modal>
    );
}
