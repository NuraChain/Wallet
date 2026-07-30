import type { Transaction } from '../../hook/history';

import { FiArrowDownLeft, FiArrowUpRight, FiInbox } from 'react-icons/fi';
import { HiOutlineListBullet } from 'react-icons/hi2';

import { T } from '../../utility/language';
import { formatDate, shortAddress, trimAmount } from '../../utility/format';

/**
 * How many transactions the wallet tab shows before sending the user to the overview.
 */
const preview = 5;

/**
 * DashboardActivity - Transaction history section of the wallet tab.
 *
 * Sits directly under the token list so holdings and the movements that produced them read as one column. Only the most recent handful are shown here: the wallet tab is a glance, and the overview page next to the heading holds the full, searchable list.
 *
 * A row opens that transaction's explorer page in the in-app browser, so following a transfer never costs the user their place.
 * @param {object} props Component props.
 * @param {Transaction[]} props.items Every transaction fetched for the account.
 * @param {boolean} props.loading Whether the history is still being fetched.
 * @param {boolean} props.canOpen Whether the network has an explorer to open rows on.
 * @param {(hash: string) => void} props.onOpen Opens one transaction on the explorer.
 * @param {() => void} props.onOverview Opens the full history page.
 * @returns {JSX.Element} The activity section.
 */
export default function DashboardActivity({ items, loading, canOpen, onOpen, onOverview }: { items: Transaction[]; loading: boolean; canOpen: boolean; onOpen: (hash: string) => void; onOverview: () => void })
{
    return (
        <div className='flex flex-col gap-2'>

            <div className='flex items-center justify-between gap-2'>

                <div className='text-tiny text-txt-muted'>

                    { T('Dashboard.Activity.Title') }

                </div>

                <button
                    type='button'
                    onClick={ onOverview }
                    className='chip-control text-tiny flex h-8 items-center gap-1 rounded-lg px-3'>

                    <HiOutlineListBullet size={ 14 } />

                    { T('Dashboard.Activity.Overview') }

                </button>

            </div>

            {
                items.slice(0, preview).map((item) => (
                    <button
                        type='button'
                        key={ item.id }
                        disabled={ !canOpen }
                        aria-label={ T('Dashboard.Activity.Open') }
                        onClick={ () => { onOpen(item.hash); } }
                        className='glass-panel flex items-center gap-3 rounded-xl p-3 text-start not-disabled:cursor-pointer'>

                        <div className='bg-btn-muted text-txt-normal flex size-9 shrink-0 items-center justify-center rounded-lg'>

                            {
                                item.incoming ? <FiArrowDownLeft size={ 18 } /> : <FiArrowUpRight size={ 18 } />
                            }

                        </div>

                        <div className='flex min-w-0 flex-1 flex-col'>

                            <div className='text-small text-txt-normal'>

                                { item.incoming ? T('Dashboard.Activity.Received') : T('Dashboard.Activity.Sent') }

                            </div>

                            <div dir='ltr' className='text-tiny text-txt-muted truncate font-mono'>

                                { item.incoming ? shortAddress(item.from) : shortAddress(item.to) }

                            </div>

                        </div>

                        <div className='flex shrink-0 flex-col items-end'>

                            <div dir='ltr' className='text-small text-txt-normal font-mono'>

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
                    <div className='text-tiny text-txt-muted py-4 text-center'>

                        { T('Dashboard.Activity.Loading') }

                    </div>
                )
            }

            {
                !loading && items.length === 0 &&
                (
                    <div className='glass-panel flex flex-col items-center gap-1 rounded-xl px-3 py-6 text-center'>

                        <FiInbox size={ 24 } className='text-txt-muted' />

                        <div className='text-small text-txt-muted'>

                            { T('Dashboard.Activity.Empty') }

                        </div>

                    </div>
                )
            }

        </div>
    );
}
