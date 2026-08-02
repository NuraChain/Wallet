import { useMemo, useState } from 'react';
import { FiCheck, FiEdit2, FiPlus } from 'react-icons/fi';

import WalletManager from '../../core/wallet';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Button from '../ui/button';
import IconBox from '../ui/iconbox';
import { ReadonlyField, TextField } from '../ui/field';
import { Modal, ModalActions, ModalBody, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { shortAddress } from '../../utility/format';
import { accountFirst, accountLimit, defaultAccountName, type Account } from '../../utility/account';

/**
 * The badges an account can wear.
 *
 * A fixed palette rather than a free text field: a keyboard's emoji picker is not reachable on every
 * platform this ships to, and one tap beats typing. They are chosen to stay distinguishable at 20px
 * and to avoid anything that renders as a flat box on an older Android WebView.
 */
const emojiList =
[
    '🦊',
    '🐺',
    '🐱',
    '🐼',
    '🦁',
    '🐸',
    '🐙',
    '🦄',
    '🚀',
    '⭐',
    '🔥',
    '💎',
    '🌙',
    '⚡',
    '🍀',
    '🌈',
    '🎯',
    '👑',
    '🔑',
    '🏦',
    '💼',
    '🧊',
    '🍉',
    '🎲'
];

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
 * @param {(index: number, patch: Partial<Account>) => void} props.onUpdate Changes an account's label or badge.
 * @param {() => void} props.onClose Closes the modal.
 * @returns {JSX.Element} The account modal.
 */
export default function DashboardAccount({ mnemonic, accounts, active, onSelect, onUpdate, onClose }: { mnemonic: string; accounts: Account[]; active: number; onSelect: (index: number) => void; onUpdate: (index: number, patch: Partial<Account>) => void; onClose: () => void })
{
    const [ draft, setDraft ] = useState('');
    const [ editing, setEditing ] = useState(-1);
    const [ picking, setPicking ] = useState(-1);
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
     *
     * The range starts at one rather than zero: index 0 is created with the wallet and is always in
     * the list, so it is the one index that can never be added. Offering it only ever produced the
     * "already in your list" error.
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

        if (!Number.isInteger(parsed) || parsed < accountFirst || parsed >= accountLimit)
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
        setPicking(-1);
        setEditing(index);
        setDraft(name);
    };

    const onSave = () =>
    {
        const trimmed = draft.trim();

        if (trimmed.length > 0)
        {
            onUpdate(editing, { name: trimmed });
        }

        setEditing(-1);
    };

    /**
     * onBadge - Applies a chosen badge and closes the picker.
     *
     * `undefined` clears it, which drops the field rather than storing a blank, so the account goes
     * back to showing its derivation index.
     * @param {number} index The account being changed.
     * @param {string | undefined} emoji The badge, or `undefined` to clear it.
     */
    const onBadge = (index: number, emoji: string | undefined) =>
    {
        onUpdate(index, { emoji });

        setPicking(-1);
    };

    const onCreate = () =>
    {
        const index = parseIndex(draftIndex);

        if (index === undefined)
        {
            setError(T('Dashboard.Accounts.ErrorIndex', String(accountFirst), String(accountLimit - 1)));

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
            scroll='body'
            onClose={ onClose }
            panelClass='max-w-[calc(100vw-2rem)]'>

            <ModalHeader
                title={ T('Dashboard.Accounts.Title') }
                subtitle={ T('Dashboard.Accounts.Subtitle') }
                onClose={ onClose } />

            {
                adding ?
                    (
                        <div className='flex flex-col gap-2'>

                            <Alert text={ error } />

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

                            <Text text={ T('Dashboard.Accounts.IndexNote') } />

                            {
                                preview.length > 0 && <ReadonlyField value={ preview } />
                            }

                            <ModalActions>

                                <Button
                                    variant='muted'
                                    size='action'
                                    onClick={ () => { setAdding(false); setError(''); } }
                                    text={ T('Dashboard.Accounts.Back') } />

                                <Button
                                    variant='primary'
                                    size='action'
                                    onClick={ onCreate }
                                    text={ T('Dashboard.Accounts.Create') } />

                            </ModalActions>

                        </div>
                    ) :
                    (
                        <>
                            <ModalBody>

                                {
                                    accounts.map((item) =>
                                    {
                                        const isActive = item.index === active;
                                        const name = item.name.length > 0 ? item.name : defaultAccountName(item.index);
                                        const hasBadge = item.emoji !== undefined && item.emoji.length > 0;

                                        if (picking === item.index)
                                        {
                                            return (
                                                <div
                                                    key={ item.index }
                                                    className='flex shrink-0 flex-col gap-2'>

                                                    <Text text={ T('Dashboard.Accounts.Emoji') } />

                                                    <div className='grid grid-cols-8 gap-1'>

                                                        {
                                                            emojiList.map((emoji) => (
                                                                <Button
                                                                    key={ emoji }
                                                                    variant='muted'
                                                                    onClick={ () => { onBadge(item.index, emoji); } }
                                                                    className='size-8 rounded-lg text-medium'
                                                                    text={ emoji } />
                                                            ))
                                                        }

                                                    </div>

                                                    <Button
                                                        variant='normal'
                                                        size='action'
                                                        onClick={ () => { onBadge(item.index, undefined); } }
                                                        text={ T('Dashboard.Accounts.EmojiClear') } />

                                                </div>
                                            );
                                        }

                                        if (editing === item.index)
                                        {
                                            return (
                                                <div
                                                    key={ item.index }
                                                    className='flex shrink-0 gap-2'>

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
                                                className={ `flex shrink-0 items-center gap-2 rounded-xl p-2 duration-300 ${ isActive ? 'bg-btn-primary/15' : '' }` }>

                                                { /*
                                                  * The disc is its own control so tapping it opens the
                                                  * badge picker, which means it cannot stay inside the
                                                  * select button — a button inside a button is invalid.
                                                  * The pair is wrapped so both gaps stay what they were.
                                                  */ }
                                                <div className='flex min-w-0 flex-1 items-center gap-3'>

                                                    <Button
                                                        onClick={ () => { setEditing(-1); setPicking(item.index); } }
                                                        aria-label={ T('Dashboard.Accounts.Emoji') }
                                                        className='shrink-0 cursor-pointer'>

                                                        { /* An emoji needs the extra step to read at disc size; a bare index does not. */ }
                                                        { /*
                                                          * The badge tile does not change with the
                                                          * active account: the row's tint and its tick
                                                          * already say which one that is, and a branded
                                                          * fill under an emoji only fights it.
                                                          */ }
                                                        <IconBox
                                                            tone='badge'
                                                            size='size-9'
                                                            className={ hasBadge ? 'text-medium' : 'text-small' }>

                                                            { hasBadge ? item.emoji : item.index }

                                                        </IconBox>

                                                    </Button>

                                                    <Button
                                                        onClick={ () => { onSelect(item.index); } }
                                                        className='flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-start'>

                                                        <div className='flex min-w-0 flex-1 flex-col'>

                                                            <Text
                                                                variant='body'
                                                                className='truncate'
                                                                text={ name } />

                                                            { /*
                                                              * `dir` sits on the span, not the block: on
                                                              * the block it would also flip `text-start`
                                                              * to the left under Persian, leaving the
                                                              * address hanging under a right-aligned name.
                                                              */ }
                                                            <Text className='truncate font-mono'>

                                                                <span dir='ltr'>

                                                                    { shortAddress(addresses[item.index] ?? '') }

                                                                </span>

                                                            </Text>

                                                        </div>

                                                        {
                                                            isActive &&
                                                            (
                                                                <FiCheck size={ 18 } className='shrink-0 text-txt-normal' />
                                                            )
                                                        }

                                                    </Button>

                                                </div>

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

                            </ModalBody>

                            <Button
                                variant='normal'
                                size='action'
                                onClick={ () => { setAdding(true); setError(''); setDraftIndex(''); } }
                                className='mt-1 shrink-0'
                                leftIcon={ <FiPlus size={ 16 } /> }
                                text={ T('Dashboard.Accounts.Add') } />
                        </>
                    )
            }

        </Modal>
    );
}
