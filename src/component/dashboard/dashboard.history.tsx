import type { Transaction } from '../../hook/history';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

import TransactionRow from './dashboard.transaction';

import Button from '../../ui/button';
import StatusBlock from '../../ui/state';
import ListCard from '../../ui/list';
import ScrollBar from '../../ui/scrollbar';
import { TextField } from '../../ui/field';
import { Modal, ModalHeader } from '../../ui/modal';

import { T } from '../../utility/language';
import { useOnline } from '../../hook/connection';
import { Horizontal, Vertical } from '../../ui/stack';

const filters = ['All', 'Sent', 'Received'] as const;

const step = 5;

type Filter = (typeof filters)[number];

export default function DashboardHistory({
    items,
    loading,
    notice,
    canOpen,
    onOpen,
    onClose
}: {
    items: Transaction[];
    loading: boolean;
    notice: string;
    canOpen: boolean;
    onOpen: (hash: string) => void;
    onClose: () => void;
}) {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('All');
    const [shown, setShown] = useState(step);

    const online = useOnline();

    const listRef = useRef<HTMLDivElement>(null);
    const endRef = useRef<HTMLDivElement>(null);

    const results = useMemo(() => {
        const needle = query.trim().toLowerCase();

        return items.filter((item) => {
            if (filter === 'Sent' && item.incoming) {
                return false;
            }

            if (filter === 'Received' && !item.incoming) {
                return false;
            }

            if (needle.length === 0) {
                return true;
            }

            return [item.hash, item.from, item.to, item.symbol].some((field) => field.toLowerCase().includes(needle));
        });
    }, [items, query, filter]);

    const visible = results.slice(0, shown);

    const emptyText = () => {
        if (items.length > 0) {
            return T('Dashboard.Activity.NoMatch');
        }

        if (!online) {
            return T('Dashboard.Activity.Offline');
        }

        return T(notice.length > 0 ? 'Dashboard.Activity.Unavailable' : 'Dashboard.Activity.Empty');
    };

    useEffect(() => {
        setShown(step);
    }, [query, filter]);

    useEffect(() => {
        const sentinel = endRef.current;

        if (sentinel === null || shown >= results.length) {
            return undefined;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setShown((current) => current + step);
                }
            },
            { root: listRef.current }
        );

        observer.observe(sentinel);

        return () => {
            observer.disconnect();
        };
    }, [shown, results.length]);

    return (
        <Modal scale={0.96} width='full' onClose={onClose} padding='none'>
            <Vertical gap={3} px={5} pt={5}>
                <ModalHeader
                    title={T('Dashboard.Activity.Title')}
                    subtitle={T('Dashboard.Activity.Count', String(results.length))}
                    titleGrow
                    close='chip'
                    closeLabel={T('Dashboard.Activity.Close')}
                    onClose={onClose}
                />

                <TextField
                    value={query}
                    spellCheck={false}
                    autoComplete='off'
                    aria-label={T('Dashboard.Activity.Search')}
                    placeholder={T('Dashboard.Activity.Search')}
                    size='compact'
                    onValue={setQuery}
                    room='leading'
                    leading={<Search size={16} className='pointer-events-none absolute inset-s-3 text-txt-muted' />}
                />

                <Horizontal gap={2}>
                    {filters.map((item) => (
                        <Button
                            key={item}
                            variant={filter === item ? 'primary' : 'chip'}
                            onClick={() => {
                                setFilter(item);
                            }}
                            aria-pressed={filter === item}
                            size='segment'
                            grow
                            text={T(`Dashboard.Activity.Filter${item}`)}
                        />
                    ))}
                </Horizontal>
            </Vertical>

            <Vertical relative squeeze='y' grow pb={4}>
                <Vertical ref={listRef} grow scroll='both'>
                    <Vertical gap={2}>
                        {visible.length > 0 && (
                            <ListCard flush>
                                {visible.map((item) => (
                                    <TransactionRow key={item.id} item={item} canOpen={canOpen} onOpen={onOpen} />
                                ))}
                            </ListCard>
                        )}

                        {loading && items.length === 0 && <StatusBlock state='loading' px={5} text={T('Dashboard.Activity.Loading')} />}

                        {!loading && results.length === 0 && <StatusBlock px={5} text={emptyText()} />}

                        {shown < results.length && <div ref={endRef} aria-hidden='true' className='h-4 shrink-0' />}
                    </Vertical>
                </Vertical>

                <ScrollBar viewportRef={listRef} />
            </Vertical>
        </Modal>
    );
}
