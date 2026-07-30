import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { FiCheck, FiEdit2 } from 'react-icons/fi';
import { IoClose } from 'react-icons/io5';

import WalletManager from '../../core/wallet';

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
                    className='glass-panel flex max-h-[80vh] w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto rounded-2xl p-4'>

                    <div className='flex items-center justify-between'>

                        <div className='flex flex-col'>

                            <div className='text-medium font-bold text-txt-normal'>

                                { T('Dashboard.Accounts.Title') }

                            </div>

                            <div className='text-tiny text-txt-muted'>

                                { T('Dashboard.Accounts.Subtitle') }

                            </div>

                        </div>

                        <button
                            type='button'
                            onClick={ onClose }
                            className='btn-muted flex size-8 shrink-0 items-center justify-center rounded-lg'>

                            <IoClose size={ 20 } />

                        </button>

                    </div>

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

                                        <input
                                            autoFocus
                                            value={ draft }
                                            placeholder={ name }
                                            onChange={ (event) => { setDraft(event.target.value); } }
                                            onKeyDown={ (event) => { if (event.key === 'Enter') { onSave(); } } }
                                            className='glass-input h-12 flex-1 rounded-xl px-3 text-small' />

                                        <button
                                            type='button'
                                            onClick={ onSave }
                                            className='btn-primary h-12 rounded-xl px-4 text-small'>

                                            { T('Dashboard.Accounts.Save') }

                                        </button>

                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={ address }
                                    className={ `flex items-center gap-2 rounded-xl p-2 duration-300 ${ isActive ? 'bg-btn-primary/15' : '' }` }>

                                    <button
                                        type='button'
                                        onClick={ () => { onSelect(index); } }
                                        className='flex flex-1 cursor-pointer items-center gap-3 text-start'>

                                        <div className={ `flex size-9 shrink-0 items-center justify-center rounded-lg text-small ${ isActive ? 'bg-btn-primary text-txt-reverse' : 'bg-btn-secondary text-txt-reverse' }` }>

                                            { index + 1 }

                                        </div>

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

                                    </button>

                                    <button
                                        type='button'
                                        aria-label={ T('Dashboard.Accounts.Rename') }
                                        onClick={ () => { onEdit(index, name); } }
                                        className='btn-muted flex size-8 shrink-0 items-center justify-center rounded-lg'>

                                        <FiEdit2 size={ 14 } />

                                    </button>

                                </div>
                            );
                        })
                    }

                </motion.div>

            </div>
        </>
    );
}
