import type { Transaction } from '../hook/history';

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { IoClose } from 'react-icons/io5';
import { FiArrowDownLeft, FiArrowUpRight, FiInbox, FiSearch } from 'react-icons/fi';

import { T } from '../utility/language';
import { formatDate, shortAddress, trimAmount } from '../utility/format';

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
        <>
            <motion.div
                initial={ { opacity: 0 } }
                animate={ { opacity: 1 } }
                exit={ { opacity: 0 } }
                className='absolute z-30 size-full cursor-pointer bg-black/25 backdrop-blur-xs'
                onClick={ onClose } />

            <div className='absolute inset-0 z-30 flex items-center justify-center p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]'>

                <motion.div
                    initial={ { opacity: 0, scale: 0.96 } }
                    animate={ { opacity: 1, scale: 1 } }
                    exit={ { opacity: 0, scale: 0.96 } }
                    className='glass-panel flex size-full max-w-2xl flex-col gap-3 rounded-2xl p-4'>

                    <div className='flex items-center gap-2'>

                        <div className='flex min-w-0 flex-1 flex-col'>

                            <div className='text-medium font-bold text-txt-normal'>

                                { T('Dashboard.Activity.Title') }

                            </div>

                            <div className='text-tiny text-txt-muted'>

                                { T('Dashboard.Activity.Count', String(results.length)) }

                            </div>

                        </div>

                        <button
                            type='button'
                            aria-label={ T('Dashboard.Activity.Close') }
                            onClick={ onClose }
                            className='chip-control flex size-9 shrink-0 items-center justify-center rounded-xl'>

                            <IoClose size={ 20 } />

                        </button>

                    </div>

                    <div className='relative flex items-center'>

                        <FiSearch size={ 16 } className='pointer-events-none absolute inset-s-3 text-txt-muted' />

                        <input
                            value={ query }
                            spellCheck={ false }
                            autoComplete='off'
                            placeholder={ T('Dashboard.Activity.Search') }
                            onChange={ (event) => { setQuery(event.target.value); } }
                            className='glass-input h-10 w-full rounded-xl ps-9 pe-3 text-small' />

                    </div>

                    <div className='flex gap-2'>

                        {
                            filters.map((item) => (
                                <button
                                    type='button'
                                    key={ item }
                                    onClick={ () => { setFilter(item); } }
                                    aria-pressed={ filter === item }
                                    className={ `h-8 flex-1 rounded-lg text-tiny duration-200 ${ filter === item ? 'btn-primary' : 'chip-control' }` }>

                                    { T(`Dashboard.Activity.Filter${ item }`) }

                                </button>
                            ))
                        }

                    </div>

                    <div className='scroll-hidden flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto'>

                        {
                            results.map((item) => (
                                <button
                                    type='button'
                                    key={ item.id }
                                    disabled={ !canOpen }
                                    aria-label={ T('Dashboard.Activity.Open') }
                                    onClick={ () => { onOpen(item.hash); } }
                                    className='glass-panel flex shrink-0 items-center gap-3 rounded-xl p-3 text-start not-disabled:cursor-pointer'>

                                    <div className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-btn-muted text-txt-normal'>

                                        {
                                            item.incoming ? <FiArrowDownLeft size={ 18 } /> : <FiArrowUpRight size={ 18 } />
                                        }

                                    </div>

                                    <div className='flex min-w-0 flex-1 flex-col'>

                                        <div className='text-small text-txt-normal'>

                                            { item.incoming ? T('Dashboard.Activity.Received') : T('Dashboard.Activity.Sent') }

                                        </div>

                                        <div dir='ltr' className='truncate font-mono text-tiny text-txt-muted'>

                                            { item.incoming ? shortAddress(item.from) : shortAddress(item.to) }

                                        </div>

                                    </div>

                                    <div className='flex shrink-0 flex-col items-end'>

                                        <div dir='ltr' className='font-mono text-small text-txt-normal'>

                                            { `${ item.incoming ? '+' : '-' }${ trimAmount(item.value) } ${ item.symbol }` }

                                        </div>

                                        <div className='text-tiny text-txt-muted'>

                                            { formatDate(item.timestamp) }

                                        </div>

                                    </div>

                                </button>
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
                                <div className='flex flex-col items-center gap-1 py-10 text-center'>

                                    <FiInbox size={ 24 } className='text-txt-muted' />

                                    <div className='text-small text-txt-muted'>

                                        { items.length === 0 ? T('Dashboard.Activity.Empty') : T('Dashboard.Activity.NoMatch') }

                                    </div>

                                </div>
                            )
                        }

                    </div>

                </motion.div>

            </div>
        </>
    );
}
