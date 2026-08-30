import type { Transaction } from '../../hook/history';

import TransactionRow from './dashboard.transaction';

import StatusBlock from '../ui/state';
import ListCard from '../ui/list';

import { T } from '../../utility/language';
import { useOnline } from '../../hook/connection';
import { Vertical } from '../ui/stack';

const preview = 5;

export default function DashboardActivity({
    items,
    loading,
    notice,
    canOpen,
    onOpen
}: {
    items: Transaction[];
    loading: boolean;
    notice: string;
    canOpen: boolean;
    onOpen: (hash: string) => void;
}) {
    const online = useOnline();

    const emptyText = () => {
        if (!online) {
            return T('Dashboard.Activity.Offline');
        }

        return notice.length > 0 ? T('Dashboard.Activity.Unavailable') : T('Dashboard.Activity.Empty');
    };

    return (
        <Vertical className='gap-2'>
            {items.length > 0 && (
                <ListCard>
                    {items.slice(0, preview).map((item) => (
                        <TransactionRow key={item.id} item={item} canOpen={canOpen} onOpen={onOpen} />
                    ))}
                </ListCard>
            )}

            {loading && items.length === 0 && <StatusBlock panel state='loading' text={T('Dashboard.Activity.Loading')} />}

            {!loading && items.length === 0 && <StatusBlock panel text={emptyText()} />}
        </Vertical>
    );
}
