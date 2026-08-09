import type { Transaction } from '../../hook/history';

import { FiArrowDownLeft, FiArrowUpRight } from 'react-icons/fi';

import Text from '../ui/text';
import Button from '../ui/button';
import IconBox from '../ui/iconbox';

import { T } from '../../utility/language';
import { glassPanel } from '../ui/panel';
import { formatDate, shortAddress, trimAmount } from '../../utility/format';
import { Vertical } from '../ui/stack';

/**
 * TransactionRow - One transaction as a tappable list row.
 *
 * Direction icon in a muted box, the counterparty under the verb, signed amount and date on the end.
 * The wallet tab's activity preview and the full history overview rendered this identical row with
 * two separate copies; both now come from here, so the two lists cannot drift apart.
 *
 * The row is a button that opens the transaction on the network's explorer, and is disabled — not
 * hidden — when the network has no explorer to open. It brightens under the pointer only while it can
 * actually be opened, so a row on a network with no explorer stays visibly inert.
 *
 * The amount carries the direction as colour: a debit in the error red, a credit in its green
 * counterpart. The sign is already there, but on a list of near-identical rows the colour is what the
 * eye picks up before it reads anything.
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
            className={ `${ glassPanel } flex shrink-0 items-center gap-3 rounded-xl p-3 text-start not-disabled:cursor-pointer not-disabled:hover:bg-btn-normal-hover` }>

            <IconBox tone='muted' size='size-9'>

                {
                    item.incoming ? <FiArrowDownLeft size={ 18 } /> : <FiArrowUpRight size={ 18 } />
                }

            </IconBox>

            <Vertical className='min-w-0 flex-1'>

                <Text
                    variant='body'
                    text={ item.incoming ? T('Dashboard.Activity.Received') : T('Dashboard.Activity.Sent') } />

                <Text
                    dir='ltr'
                    className='truncate font-mono'
                    text={ item.incoming ? shortAddress(item.from) : shortAddress(item.to) } />

            </Vertical>

            <Vertical className='shrink-0 items-end'>

                <Text
                    dir='ltr'
                    variant='body'
                    className={ `font-mono ${ item.incoming ? 'text-txt-success' : 'text-txt-error' }` }
                    text={ `${ item.incoming ? '+' : '-' }${ trimAmount(item.value) } ${ item.symbol }` } />

                <Text text={ formatDate(item.timestamp) } />

            </Vertical>

        </Button>
    );
}
