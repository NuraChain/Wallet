import { useMemo, useState } from 'react';
import { Check, Pen, Plus, Trash } from 'lucide-react';

import Text from '../../ui/text';
import Alert from '../../ui/alert';
import Button from '../../ui/button';
import IconBox from '../../ui/iconbox';

import ChoiceRow from '../../ui/choice';
import { ReadonlyField, TextField } from '../../ui/field';
import { Modal, ModalActions, ModalBody, ModalHeader } from '../../ui/modal';
import { ConfirmPanel } from '../../ui/confirm';

import { T } from '../../utility/language';
import { shortAddress } from '../../utility/format';
import { vaultAddress, vaultDerivable, type Vault } from '../../core/vault';
import { accountFirst, accountLimit, defaultAccountName, type Account } from '../../utility/account';
import { Horizontal, Vertical } from '../../ui/stack';

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
    onRemove,
    onClose
}: {
    vault: Vault;
    accounts: Account[];
    active: number;
    onSelect: (index: number) => void;
    onUpdate: (index: number, patch: Partial<Account>) => void;
    onRemove: (index: number) => void;
    onClose: () => void;
}) {
    const derivable = vaultDerivable(vault);

    const [draft, setDraft] = useState('');
    const [editing, setEditing] = useState(-1);
    const [picking, setPicking] = useState(-1);
    const [adding, setAdding] = useState(false);
    const [removing, setRemoving] = useState<{ index: number; name: string } | undefined>(undefined);
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

            {removing !== undefined && (
                <ConfirmPanel
                    title={T('Dashboard.Accounts.Remove')}
                    message={T('Dashboard.Accounts.RemoveConfirm', removing.name)}
                    onCancel={() => {
                        setRemoving(undefined);
                    }}
                    onConfirm={() => {
                        onRemove(removing.index);
                        setRemoving(undefined);
                    }}
                />
            )}

            {removing === undefined &&
                (adding ? (
                    <Vertical gap={2}>
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
                            mono
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
                                        <Vertical key={item.index} gap={2}>
                                            <Text text={T('Dashboard.Accounts.Emoji')} />

                                            <div className='grid grid-cols-5 gap-1'>
                                                {emojiList.map((emoji) => (
                                                    <Button
                                                        key={emoji}
                                                        variant='muted'
                                                        onClick={() => {
                                                            onBadge(item.index, emoji);
                                                        }}
                                                        size='emoji'
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
                                        <Horizontal key={item.index} gap={2}>
                                            <div className='flex-1'>
                                                <TextField autoFocus value={draft} placeholder={name} onValue={setDraft} onEnter={onSave} />
                                            </div>

                                            <Button variant='primary' size='actionFit' onClick={onSave} text={T('Dashboard.Accounts.Save')} />
                                        </Horizontal>
                                    );
                                }

                                return (
                                    <ChoiceRow key={item.index} selected={isActive}>
                                        <Horizontal squeeze='x' grow align='center' gap={3}>
                                            <Button
                                                onClick={() => {
                                                    setEditing(-1);
                                                    setPicking(item.index);
                                                }}
                                                aria-label={T('Dashboard.Accounts.Emoji')}
                                                variant='plain'
                                                shrink={false}
                                            >
                                                <IconBox tone='badge' size={9} glyph={hasBadge ? 'medium' : 'small'}>
                                                    {hasBadge ? item.emoji : item.index}
                                                </IconBox>
                                            </Button>

                                            <Button
                                                onClick={() => {
                                                    onSelect(item.index);
                                                }}
                                                variant='row'
                                                squeeze='x'
                                                grow
                                            >
                                                <Vertical squeeze='x' grow>
                                                    <Text variant='body' truncate text={name} />

                                                    <Text dir='ltr' truncate mono text={shortAddress(addresses[item.index] ?? '')} />
                                                </Vertical>

                                                {isActive && <Check size={18} className='shrink-0 text-txt-normal' />}
                                            </Button>
                                        </Horizontal>

                                        <Button
                                            variant='muted'
                                            size='icon'
                                            aria-label={T('Dashboard.Accounts.Rename')}
                                            onClick={() => {
                                                onEdit(item.index, name);
                                            }}
                                            shrink={false}
                                        >
                                            <Pen size={14} />
                                        </Button>

                                        {item.index >= accountFirst && (
                                            <Button
                                                variant='danger'
                                                size='icon'
                                                aria-label={T('Dashboard.Accounts.Remove')}
                                                onClick={() => {
                                                    setRemoving({ index: item.index, name });
                                                }}
                                                shrink={false}
                                            >
                                                <Trash size={14} />
                                            </Button>
                                        )}
                                    </ChoiceRow>
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
                                    leftIcon={<Plus size={16} />}
                                    text={T('Dashboard.Accounts.Add')}
                                />
                            </ModalActions>
                        ) : (
                            <Text pt={1} align='center' text={T('Dashboard.Accounts.SingleNote')} />
                        )}
                    </>
                ))}
        </Modal>
    );
}
