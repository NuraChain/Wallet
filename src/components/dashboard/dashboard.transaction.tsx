import type { Transaction } from '../../hook/history';

import { useId } from 'react';
import { FiArrowDownLeft, FiArrowUpRight } from 'react-icons/fi';

import Text from '../ui/text';
import Button from '../ui/button';
import IconBox from '../ui/iconbox';

import { T } from '../../utility/language';
import { surfacePanel } from '../ui/panel';
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
    const hintId = `${ useId() }-open`;

    /*
     * No `aria-label` on the row. It carried one reading only "Open", and a name on a composite
     * control replaces everything inside it — so every transaction in the app announced as the single
     * word "Open", with the direction, the counterparty, the amount and the date all discarded. The
     * row's own text is a better name than any label could be, so it is left to speak for itself, and
     * the explorer destination is described instead: that is the part the visible text does not say.
     */
    return (
        <Button
            disabled={ !canOpen }
            aria-describedby={ canOpen ? hintId : undefined }
            onClick={ () => { onOpen(item.hash); } }
            className={ `${ surfacePanel } flex shrink-0 items-center gap-3 rounded-surface p-3 text-start not-disabled:cursor-pointer not-disabled:hover:bg-btn-normal-hover` }>

            <IconBox tone='muted' className='size-9'>

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

            { /*
              * `min-w-0 truncate` because `item.symbol` is whatever the contract calls itself. Every
              * other region on this row already had both; this one was `shrink-0` with neither, so an
              * airdrop-spam token with a sentence for a ticker pushed the row open.
              */ }
            <Vertical className='min-w-0 shrink-0 items-end'>

                <Text
                    dir='ltr'
                    variant='body'
                    className={ `truncate font-mono ${ item.incoming ? 'text-txt-success' : 'text-txt-error' }` }
                    text={ `${ item.incoming ? '+' : '-' }${ trimAmount(item.value) } ${ item.symbol }` } />

                <Text text={ formatDate(item.timestamp) } />

            </Vertical>

            {
                canOpen &&
                (
                    <Text
                        id={ hintId }
                        className='sr-only'
                        text={ T('Dashboard.Activity.Open') } />
                )
            }

        </Button>
    );
}
