import type { Transaction } from '../../hook/history';

import { FiArrowDownLeft, FiArrowUpRight } from 'react-icons/fi';

import Text from '../ui/text';
import Button from '../ui/button';
import IconBox from '../ui/iconbox';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { formatDate, shortAddress, trimAmount } from '../../utility/format';
import { Vertical } from '../ui/stack';

export default function TransactionRow({ item, canOpen, onOpen }: { item: Transaction; canOpen: boolean; onOpen: (hash: string) => void }) {
    return (
        <Button
            disabled={!canOpen}
            onClick={() => {
                onOpen(item.hash);
            }}
            className={cn('flex shrink-0 items-center gap-3 p-3 text-start not-disabled:cursor-pointer not-disabled:hover:bg-btn-muted-hover')}
        >
            <IconBox tone='muted' className='size-9'>
                {item.incoming ? <FiArrowDownLeft size={18} /> : <FiArrowUpRight size={18} />}
            </IconBox>

            <Vertical className='min-w-0 flex-1'>
                <Text variant='body' text={item.incoming ? T('Dashboard.Activity.Received') : T('Dashboard.Activity.Sent')} />

                <Text dir='ltr' className='truncate font-mono' text={item.incoming ? shortAddress(item.from) : shortAddress(item.to)} />
            </Vertical>

            <Vertical className='min-w-0 shrink-0 items-end'>
                <Text
                    dir='ltr'
                    variant='body'
                    className={`truncate font-mono ${item.incoming ? 'text-txt-success' : 'text-txt-error'}`}
                    text={`${item.incoming ? '+' : '-'}${trimAmount(item.value)} ${item.symbol}`}
                />

                <Text text={formatDate(item.timestamp)} />
            </Vertical>

            {canOpen && <Text className='sr-only' text={T('Dashboard.Activity.Open')} />}
        </Button>
    );
}
