import type { Transaction } from '../../hook/history';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FiSearch } from 'react-icons/fi';

import TransactionRow from './dashboard.transaction';

import Text from '../ui/text';
import Button from '../ui/button';
import EmptyState from '../ui/state';
import { TextField } from '../ui/field';
import { Modal, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import { useOnline } from '../../hook/connection';
import { Horizontal } from '../ui/stack';

/**
 * The direction filters offered above the list.
 */
const filters = [ 'All', 'Sent', 'Received' ] as const;

/**
 * How many rows are on screen to begin with, and how many more each time the end is reached.
 *
 * The transactions are all in memory already — the explorer hands over a page of fifty at once — so
 * this is about what is rendered rather than what is fetched. Fifty glass panels, each with its own
 * backdrop blur, is a lot of compositing for a list where the answer is almost always in the first few.
 */
const step = 5;

type Filter = typeof filters[number];

/**
 * DashboardHistory - The complete transaction history, with search and filtering.
 *
 * The wallet tab only has room for the last handful of transactions, so this is where the full list
 * lives. Search matches a transaction's hash, either party's address, and the asset symbol at once,
 * because a user hunting a transfer usually remembers only one of the three.
 *
 * Rows share the activity list's behaviour: opening one hands the explorer link to the in-app browser.
 * @param {object} props Component props.
 * @param {Transaction[]} props.items Every transaction fetched for the account.
 * @param {boolean} props.loading Whether the history is still being fetched.
 * @param {string} props.notice Why the explorer returned nothing, when it said so itself.
 * @param {boolean} props.canOpen Whether the network has an explorer to open rows on.
 * @param {(hash: string) => void} props.onOpen Opens one transaction on the explorer.
 * @param {() => void} props.onClose Closes the page.
 * @returns {JSX.Element} The full history page.
 */
export default function DashboardHistory({ items, loading, notice, canOpen, onOpen, onClose }: { items: Transaction[]; loading: boolean; notice: string; canOpen: boolean; onOpen: (hash: string) => void; onClose: () => void })
{
    const [ query, setQuery ] = useState('');
    const [ filter, setFilter ] = useState<Filter>('All');
    const [ shown, setShown ] = useState(step);

    const online = useOnline();

    const listRef = useRef<HTMLDivElement>(null);
    const endRef = useRef<HTMLDivElement>(null);

    const results = useMemo(() =>
    {
        const needle = query.trim().toLowerCase();

        return items.filter((item) =>
        {
            if (filter === 'Sent' && item.incoming)
            {
                return false;
            }

            if (filter === 'Received' && !item.incoming)
            {
                return false;
            }

            if (needle.length === 0)
            {
                return true;
            }

            return [ item.hash, item.from, item.to, item.symbol ].some((field) => field.toLowerCase().includes(needle));
        });
    }, [ items, query, filter ]);

    const visible = results.slice(0, shown);

    /**
     * emptyText - Why there is nothing to show, ranked the same way the activity glance ranks it.
     *
     * A search that matched nothing is the user's own doing and outranks everything; after that, no
     * link means the list was never fetched, which is not the account being empty.
     * @returns {string} The line to render in place of the list.
     */
    const emptyText = () =>
    {
        if (items.length > 0)
        {
            return T('Dashboard.Activity.NoMatch');
        }

        if (!online)
        {
            return T('Dashboard.Activity.Offline');
        }

        return T(notice.length > 0 ? 'Dashboard.Activity.Unavailable' : 'Dashboard.Activity.Empty');
    };

    // Back to the first few whenever the list itself changes. Searching after having scrolled deep into
    // the previous result set would otherwise open on forty rows of the new one.
    useEffect(() =>
    {
        setShown(step);
    }, [ query, filter ]);

    // Reveals the next few when the end of the list reaches the bottom of its own scroller — `root` is
    // the scrolling panel, not the window, which is what the list actually moves inside. The sentinel
    // only exists while something is still held back, so there is nothing to observe once the whole
    // list is out; re-running on `shown` is what re-attaches it after each reveal.
    useEffect(() =>
    {
        const sentinel = endRef.current;

        if (sentinel === null || shown >= results.length)
        {
            return undefined;
        }

        const observer = new IntersectionObserver((entries) =>
        {
            if (entries.some((entry) => entry.isIntersecting))
            {
                setShown((current) => current + step);
            }
        }, { root: listRef.current });

        observer.observe(sentinel);

        return () => { observer.disconnect(); };
    }, [ shown, results.length ]);

    return (
        <Modal
            frame='screen'
            scale={ 0.96 }
            onClose={ onClose }
            panelClass='size-full max-w-2xl'>

            <ModalHeader
                title={ T('Dashboard.Activity.Title') }
                subtitle={ T('Dashboard.Activity.Count', String(results.length)) }
                groupClass='flex-1'
                close='chip'
                closeLabel={ T('Dashboard.Activity.Close') }
                onClose={ onClose } />

            <TextField
                value={ query }
                spellCheck={ false }
                autoComplete='off'
                placeholder={ T('Dashboard.Activity.Search') }
                onValue={ setQuery }
                className='h-10 ps-9 pe-3'
                leading={ <FiSearch size={ 16 } className='pointer-events-none absolute inset-s-3 text-txt-muted' /> } />

            <Horizontal className='gap-2'>

                {
                    filters.map((item) => (
                        <Button
                            key={ item }
                            variant={ filter === item ? 'primary' : 'chip' }
                            onClick={ () => { setFilter(item); } }
                            aria-pressed={ filter === item }
                            className='h-8 flex-1 rounded-control text-tiny duration-(--duration-base)'
                            text={ T(`Dashboard.Activity.Filter${ item }`) } />
                    ))
                }

            </Horizontal>

            <div
                ref={ listRef }
                className='scroll-hidden flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto'>

                {
                    visible.map((item) => (
                        <TransactionRow
                            key={ item.id }
                            item={ item }
                            canOpen={ canOpen }
                            onOpen={ onOpen } />
                    ))
                }

                {
                    loading && items.length === 0 &&
                    (
                        <Text
                            className='py-6 text-center'
                            text={ T('Dashboard.Activity.Loading') } />
                    )
                }

                {
                    !loading && results.length === 0 &&
                    (
                        <EmptyState text={ emptyText() } />
                    )
                }

                { /*
                  * Nothing to look at: it exists to be scrolled into view. `shrink-0` so the flex column
                  * cannot collapse it to nothing, which would leave it permanently at the edge of the
                  * scroller and firing.
                  */ }
                {
                    shown < results.length &&
                    (
                        <div
                            ref={ endRef }
                            aria-hidden='true'
                            className='h-4 shrink-0' />
                    )
                }

            </div>

        </Modal>
    );
}
