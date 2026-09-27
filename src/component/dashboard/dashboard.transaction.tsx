import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

import Text from '../../ui/text';
import Button from '../../ui/button';
import IconBox from '../../ui/iconbox';

import { T } from '../../utility/language';
import { formatDate, shortAddress, trimAmount } from '../../utility/format';
import { Vertical } from '../../ui/stack';
import type { Transaction } from '../../type/wallet';

export default function TransactionRow({ item, canOpen, onOpen }: { item: Transaction; canOpen: boolean; onOpen: (hash: string) => void }) {
    return (
        <Button
            fullWidth
            disabled={!canOpen}
            onClick={() => {
                onOpen(item.hash);
            }}
            variant='listRow'
            shrink={false}
        >
            <IconBox tone='muted' size={9}>
                {item.incoming ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
            </IconBox>

            <Vertical squeeze='x' grow>
                <Text variant='body' text={item.incoming ? T('Dashboard.Activity.Received') : T('Dashboard.Activity.Sent')} />

                <Text dir='ltr' truncate mono text={item.incoming ? shortAddress(item.from) : shortAddress(item.to)} />
            </Vertical>

            <Vertical squeeze='x' shrink={false} align='end'>
                <Text
                    dir='ltr'
                    variant='body'
                    truncate
                    mono
                    tone={item.incoming ? 'accent' : 'normal'}
                    text={`${item.incoming ? '+' : '-'}${trimAmount(item.value)} ${item.symbol}`}
                />

                <Text text={formatDate(item.timestamp)} />
            </Vertical>

            {canOpen && <Text srOnly text={T('Dashboard.Activity.Open')} />}
        </Button>
    );
}
