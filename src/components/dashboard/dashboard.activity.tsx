import type { Transaction } from '../../hook/history';

import { HiOutlineListBullet } from 'react-icons/hi2';

import TransactionRow from './dashboard.transaction';

import Button from '../ui/button';
import StatusBlock from '../ui/state';
import ListCard from '../ui/list';
import SectionHeader from '../ui/section';

import { T } from '../../utility/language';
import { useOnline } from '../../hook/connection';
import { Vertical } from '../ui/stack';

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
 * @param {string} props.notice Why the explorer returned nothing, when it said so itself.
 * @param {boolean} props.canOpen Whether the network has an explorer to open rows on.
 * @param {(hash: string) => void} props.onOpen Opens one transaction on the explorer.
 * @param {() => void} props.onOverview Opens the full history page.
 * @returns {JSX.Element} The activity section.
 */
export default function DashboardActivity({ items, loading, notice, canOpen, onOpen, onOverview }: { items: Transaction[]; loading: boolean; notice: string; canOpen: boolean; onOpen: (hash: string) => void; onOverview: () => void })
{
    const online = useOnline();

    // What an empty list means, in the order the answers rank. Offline comes first because it is the
    // only one of the three the app can be certain of: with no link nothing was asked, so neither the
    // account's emptiness nor the explorer's refusal has been established. The read is skipped entirely
    // in that state, which is exactly why the list cannot be trusted to speak for itself here.
    const emptyText = () =>
    {
        if (!online)
        {
            return T('Dashboard.Activity.Offline');
        }

        return notice.length > 0 ? T('Dashboard.Activity.Unavailable') : T('Dashboard.Activity.Empty');
    };

    return (
        <Vertical className='gap-2'>

            <SectionHeader title={ T('Dashboard.Activity.Title') }>

                <Button
                    variant='muted'
                    size='small'
                    onClick={ onOverview }
                    leftIcon={ <HiOutlineListBullet size={ 14 } /> }
                    text={ T('Dashboard.Activity.Overview') } />

            </SectionHeader>

            {
                items.length > 0 &&
                (
                    <ListCard>

                        {
                            items.slice(0, preview).map((item) => (
                                <TransactionRow
                                    key={ item.id }
                                    item={ item }
                                    canOpen={ canOpen }
                                    onOpen={ onOpen } />
                            ))
                        }

                    </ListCard>
                )
            }

            {
                loading && items.length === 0 &&
                (
                    <StatusBlock
                        panel
                        state='loading'
                        text={ T('Dashboard.Activity.Loading') } />
                )
            }

            { /*
              * An empty list, an unreadable one and an unasked one look identical, and only one of them
              * is the user's doing — so the three say different things. It stays the ordinary empty
              * state in every case: a network whose explorer will never answer without a paid plan is a
              * standing condition, not a fault, and the explorer's own sentence in a red panel read as
              * something breaking. The reason itself is not printed; it is English marketing copy from
              * a third party, and nothing the user can act on from here.
              */ }
            {
                !loading && items.length === 0 &&
                (
                    <StatusBlock panel text={ emptyText() } />
                )
            }

        </Vertical>
    );
}
