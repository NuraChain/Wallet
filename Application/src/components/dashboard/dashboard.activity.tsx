import type { Transaction } from '../../hook/history';

import { HiOutlineListBullet } from 'react-icons/hi2';

import TransactionRow from './dashboard.transaction';

import Text from '../ui/text';
import Button from '../ui/button';
import EmptyState from '../ui/state';
import SectionHeader from '../ui/section';

import { T } from '../../utility/language';

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

            <SectionHeader title={ T('Dashboard.Activity.Title') }>

                <Button
                    variant='chip'
                    onClick={ onOverview }
                    className='h-8 gap-1 rounded-lg px-3 text-tiny'
                    leftIcon={ <HiOutlineListBullet size={ 14 } /> }
                    text={ T('Dashboard.Activity.Overview') } />

            </SectionHeader>

            {
                items.slice(0, preview).map((item) => (
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
                        className='py-4 text-center'
                        text={ T('Dashboard.Activity.Loading') } />
                )
            }

            {
                !loading && items.length === 0 &&
                (
                    <EmptyState panel text={ T('Dashboard.Activity.Empty') } />
                )
            }

        </div>
    );
}
