import type { Transaction } from '../../hook/history';

import { useMemo, useState } from 'react';
import { FiSearch } from 'react-icons/fi';

import TransactionRow from './dashboard.transaction';

import Button from '../ui/button';
import EmptyState from '../ui/state';
import { TextField } from '../ui/field';
import { Modal, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';

/**
 * The direction filters offered above the list.
 */
const filters = [ 'All', 'Sent', 'Received' ] as const;

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
 * @param {boolean} props.canOpen Whether the network has an explorer to open rows on.
 * @param {(hash: string) => void} props.onOpen Opens one transaction on the explorer.
 * @param {() => void} props.onClose Closes the page.
 * @returns {JSX.Element} The full history page.
 */
export default function DashboardHistory({ items, loading, canOpen, onOpen, onClose }: { items: Transaction[]; loading: boolean; canOpen: boolean; onOpen: (hash: string) => void; onClose: () => void })
{
    const [ query, setQuery ] = useState('');
    const [ filter, setFilter ] = useState<Filter>('All');

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

    return (
        <Modal
            frame='screen'
            scale={ 0.96 }
            onClose={ onClose }
            panelClass='size-full max-w-2xl'>

            <ModalHeader
                title={ T('Dashboard.Activity.Title') }
                subtitle={ T('Dashboard.Activity.Count', String(results.length)) }
                groupClass='min-w-0 flex-1'
                className='gap-2'
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

            <div className='flex gap-2'>

                {
                    filters.map((item) => (
                        <Button
                            key={ item }
                            onClick={ () => { setFilter(item); } }
                            aria-pressed={ filter === item }
                            className={ `h-8 flex-1 rounded-lg text-tiny duration-200 ${ filter === item ? 'btn-primary' : 'chip-control' }` }>

                            { T(`Dashboard.Activity.Filter${ item }`) }

                        </Button>
                    ))
                }

            </div>

            <div className='scroll-hidden flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto'>

                {
                    results.map((item) => (
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
                        <div className='py-6 text-center text-tiny text-txt-muted'>

                            { T('Dashboard.Activity.Loading') }

                        </div>
                    )
                }

                {
                    !loading && results.length === 0 &&
                    (
                        <EmptyState>

                            { items.length === 0 ? T('Dashboard.Activity.Empty') : T('Dashboard.Activity.NoMatch') }

                        </EmptyState>
                    )
                }

            </div>

        </Modal>
    );
}
