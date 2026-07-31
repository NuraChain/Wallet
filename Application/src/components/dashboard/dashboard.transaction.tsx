import type { Transaction } from '../../hook/history';

import { FiArrowDownLeft, FiArrowUpRight } from 'react-icons/fi';

import Button from '../ui/button';
import IconBox from '../ui/iconbox';

import { T } from '../../utility/language';
import { formatDate, shortAddress, trimAmount } from '../../utility/format';

/**
 * TransactionRow - One transaction as a tappable list row.
 *
 * Direction icon in a muted box, the counterparty under the verb, signed amount and date on the end.
 * The wallet tab's activity preview and the full history overview rendered this identical row with
 * two separate copies; both now come from here, so the two lists cannot drift apart.
 *
 * The row is a button that opens the transaction on the network's explorer, and is disabled — not
 * hidden — when the network has no explorer to open.
 * @param {object} props Component props.
 * @param {Transaction} props.item The transaction to render.
 * @param {boolean} props.canOpen Whether the network has an explorer to open the row on.
 * @param {(hash: string) => void} props.onOpen Opens the transaction on the explorer.
 * @returns {JSX.Element} The row.
 */
export default function TransactionRow({ item, canOpen, onOpen }: { item: Transaction; canOpen: boolean; onOpen: (hash: string) => void })
{
    return (
        <Button
            disabled={ !canOpen }
            aria-label={ T('Dashboard.Activity.Open') }
            onClick={ () => { onOpen(item.hash); } }
            className='glass-panel flex shrink-0 items-center gap-3 rounded-xl p-3 text-start not-disabled:cursor-pointer'>

            <IconBox tone='muted' size='size-9'>

                {
                    item.incoming ? <FiArrowDownLeft size={ 18 } /> : <FiArrowUpRight size={ 18 } />
                }

            </IconBox>

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

        </Button>
    );
}
