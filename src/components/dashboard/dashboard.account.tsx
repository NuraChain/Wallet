import { useMemo, useState } from 'react';
import { FiCheck, FiEdit2, FiPlus } from 'react-icons/fi';

import Text from '../ui/text';
import Alert from '../ui/alert';
import Button from '../ui/button';
import IconBox from '../ui/iconbox';

import { selectedTint } from '../ui/menu';
import { ReadonlyField, TextField } from '../ui/field';
import { Modal, ModalActions, ModalBody, ModalHeader } from '../ui/modal';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { shortAddress } from '../../utility/format';
import { vaultAddress, vaultDerivable, type Vault } from '../../core/vault';
import { accountFirst, accountLimit, defaultAccountName, type Account } from '../../utility/account';
import { Horizontal, Vertical } from '../ui/stack';

const emojiList = [
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

export default function DashboardAccount({
    vault,
    accounts,
    active,
    onSelect,
    onUpdate,
    onClose
}: {
    vault: Vault;
    accounts: Account[];
    active: number;
    onSelect: (index: number) => void;
    onUpdate: (index: number, patch: Partial<Account>) => void;
    onClose: () => void;
}) {
    const derivable = vaultDerivable(vault);

    const [draft, setDraft] = useState('');
    const [editing, setEditing] = useState(-1);
    const [picking, setPicking] = useState(-1);
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState('');
    const [draftIndex, setDraftIndex] = useState('');

    const addresses = useMemo(() => {
        const map: Record<number, string> = {};

        for (const item of accounts) {
            map[item.index] = vaultAddress(vault, item.index);
        }

        return map;
    }, [vault, accounts]);

    const parseIndex = (value: string) => {
        const trimmed = value.trim();

        if (trimmed.length === 0) {
            return undefined;
        }

        const parsed = Number(trimmed);

        if (!Number.isInteger(parsed) || parsed < accountFirst || parsed >= accountLimit) {
            return undefined;
        }

        return parsed;
    };

    const preview = useMemo(() => {
        const index = parseIndex(draftIndex);

        return index === undefined ? '' : vaultAddress(vault, index);
    }, [vault, draftIndex]);

    const onEdit = (index: number, name: string) => {
        setPicking(-1);
        setEditing(index);
        setDraft(name);
    };

    const onSave = () => {
        const trimmed = draft.trim();

        if (trimmed.length > 0) {
            onUpdate(editing, { name: trimmed });
        }

        setEditing(-1);
    };

    const onBadge = (index: number, emoji: string | undefined) => {
        onUpdate(index, { emoji });

        setPicking(-1);
    };

    const onCreate = () => {
        const index = parseIndex(draftIndex);

        if (index === undefined) {
            setError(T('Dashboard.Accounts.ErrorIndex', String(accountFirst), String(accountLimit - 1)));

            return;
        }

        if (accounts.some((item) => item.index === index)) {
            setError(T('Dashboard.Accounts.ErrorExists'));

            return;
        }

        onSelect(index);

        setAdding(false);
        setDraftIndex('');
        setError('');
    };

    return (
        <Modal scroll onClose={onClose}>
            <ModalHeader title={T('Dashboard.Accounts.Title')} subtitle={T('Dashboard.Accounts.Subtitle')} onClose={onClose} />

            {adding ? (
                <Vertical className='gap-2'>
                    <Alert text={error} />

                    <TextField
                        autoFocus
                        dir='ltr'
                        value={draftIndex}
                        inputMode='numeric'
                        label={T('Dashboard.Accounts.Index')}
                        placeholder={T('Dashboard.Accounts.IndexHint')}
                        onValue={setDraftIndex}
                        onEnter={onCreate}
                        className='font-mono'
                    />

                    <Text text={T('Dashboard.Accounts.IndexNote')} />

                    {preview.length > 0 && <ReadonlyField value={preview} />}

                    <ModalActions>
                        <Button
                            variant='muted'
                            size='action'
                            onClick={() => {
                                setAdding(false);
                                setError('');
                            }}
                            text={T('Dashboard.Accounts.Back')}
                        />

                        <Button variant='primary' size='action' onClick={onCreate} text={T('Dashboard.Accounts.Create')} />
                    </ModalActions>
                </Vertical>
            ) : (
                <>
                    <ModalBody>
                        {accounts.map((item) => {
                            const isActive = item.index === active;
                            const name = item.name.length > 0 ? item.name : defaultAccountName(item.index);
                            const hasBadge = item.emoji !== undefined && item.emoji.length > 0;

                            if (picking === item.index) {
                                return (
                                    <Vertical key={item.index} className='gap-2'>
                                        <Text text={T('Dashboard.Accounts.Emoji')} />

                                        <div className='grid grid-cols-5 gap-1'>
                                            {emojiList.map((emoji) => (
                                                <Button
                                                    key={emoji}
                                                    variant='muted'
                                                    onClick={() => {
                                                        onBadge(item.index, emoji);
                                                    }}
                                                    className='h-10 w-full rounded-control text-medium'
                                                    text={emoji}
                                                />
                                            ))}
                                        </div>

                                        <Button
                                            variant='normal'
                                            size='action'
                                            onClick={() => {
                                                onBadge(item.index, undefined);
                                            }}
                                            text={T('Dashboard.Accounts.EmojiClear')}
                                        />
                                    </Vertical>
                                );
                            }

                            if (editing === item.index) {
                                return (
                                    <Horizontal key={item.index} className='gap-2'>
                                        <div className='flex-1'>
                                            <TextField autoFocus value={draft} placeholder={name} onValue={setDraft} onEnter={onSave} />
                                        </div>

                                        <Button variant='primary' size='action' onClick={onSave} className='px-4' text={T('Dashboard.Accounts.Save')} />
                                    </Horizontal>
                                );
                            }

                            return (
                                <Horizontal
                                    key={item.index}
                                    className={`items-center gap-2 rounded-surface border border-transparent p-2 transition-colors duration-(--duration-fast) ${isActive ? selectedTint : 'hover:bg-btn-muted-hover'}`}
                                >
                                    <Horizontal className='min-w-0 flex-1 items-center gap-3'>
                                        <Button
                                            onClick={() => {
                                                setEditing(-1);
                                                setPicking(item.index);
                                            }}
                                            aria-label={T('Dashboard.Accounts.Emoji')}
                                            className='shrink-0 cursor-pointer'
                                        >
                                            <IconBox tone='badge' className={cn('size-9', hasBadge ? 'text-medium' : 'text-small')}>
                                                {hasBadge ? item.emoji : item.index}
                                            </IconBox>
                                        </Button>

                                        <Button
                                            onClick={() => {
                                                onSelect(item.index);
                                            }}
                                            className='flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-start'
                                        >
                                            <Vertical className='min-w-0 flex-1'>
                                                <Text variant='body' className='truncate' text={name} />

                                                <Text dir='ltr' className='truncate font-mono' text={shortAddress(addresses[item.index] ?? '')} />
                                            </Vertical>

                                            {isActive && <FiCheck size={18} className='shrink-0 text-txt-normal' />}
                                        </Button>
                                    </Horizontal>

                                    <Button
                                        variant='muted'
                                        size='icon'
                                        aria-label={T('Dashboard.Accounts.Rename')}
                                        onClick={() => {
                                            onEdit(item.index, name);
                                        }}
                                        className='shrink-0'
                                    >
                                        <FiEdit2 size={14} />
                                    </Button>
                                </Horizontal>
                            );
                        })}
                    </ModalBody>

                    {derivable ? (
                        <ModalActions>
                            <Button
                                variant='normal'
                                size='action'
                                onClick={() => {
                                    setAdding(true);
                                    setError('');
                                    setDraftIndex('');
                                }}
                                leftIcon={<FiPlus size={16} />}
                                text={T('Dashboard.Accounts.Add')}
                            />
                        </ModalActions>
                    ) : (
                        <Text className='pt-1 text-center' text={T('Dashboard.Accounts.SingleNote')} />
                    )}
                </>
            )}
        </Modal>
    );
}
