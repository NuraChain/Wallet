import { FiWifiOff } from 'react-icons/fi';

import Text from '../ui/text';
import Panel from '../ui/panel';
import IconBox from '../ui/iconbox';

import { T } from '../../utility/language';
import { formatAge } from '../../utility/format';
import { useOnline } from '../../hook/connection';
import { Vertical } from '../ui/stack';

export default function DashboardOffline({ error, at }: { error: boolean; at: number }) {
    const online = useOnline();

    if (online && !error) {
        return undefined;
    }

    return (
        <Panel className='flex items-center gap-3'>
            <IconBox className='size-9'>
                <FiWifiOff size={18} />
            </IconBox>

            <Vertical className='min-w-0 flex-1 gap-0.5'>
                <Text variant='captionStrong' text={online ? T('Dashboard.Offline.Failed') : T('Dashboard.Offline.Title')} />

                <Text text={at > 0 ? T('Dashboard.Offline.Updated', formatAge(at)) : T('Dashboard.Offline.Message')} />
            </Vertical>
        </Panel>
    );
}
