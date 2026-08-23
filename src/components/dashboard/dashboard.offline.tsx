import { FiWifiOff } from 'react-icons/fi';

import Text from '../ui/text';
import Panel from '../ui/panel';
import IconBox from '../ui/iconbox';

import { T } from '../../utility/language';
import { formatAge } from '../../utility/format';
import { useOnline } from '../../hook/connection';
import { Vertical } from '../ui/stack';

/**
 * DashboardOffline - The strip that says the figures above it are not current.
 *
 * Everything else on the wallet tab is built to survive a dead connection: balances fall back to what
 * was last read, prices come off disk, history renders from cache. This is the one piece that makes
 * that honest — without it the tab is indistinguishable from a live one, and a stale balance presented
 * as current is worse than no balance at all.
 *
 * It renders nothing while the connection is up and every read is landing, so the caller needs no
 * conditional around it — the same contract `Alert` has.
 *
 * Two situations, one strip: no link at all, and a link that is up while the chain refuses to answer.
 * They read differently to the user (one is theirs to fix, the other is not) and identically to the
 * data, so the heading changes and the age line does not.
 * @param {object} props Component props.
 * @param {boolean} props.error Whether the last read failed while the link was up.
 * @param {number} props.at When the figures on screen were read, or 0 when they never were.
 * @returns {JSX.Element | undefined} The strip, or nothing when everything is current.
 */
export default function DashboardOffline({ error, at }: { error: boolean; at: number })
{
    const online = useOnline();

    if (online && !error)
    {
        return undefined;
    }

    return (
        <Panel className='flex items-center gap-3 rounded-surface p-3'>

            <IconBox className='size-9'>

                <FiWifiOff size={ 18 } />

            </IconBox>

            <Vertical className='min-w-0 flex-1 gap-0.5'>

                <Text
                    variant='captionStrong'
                    text={ online ? T('Dashboard.Offline.Failed') : T('Dashboard.Offline.Title') } />

                { /*
                  * The age is the whole point of the second line, so it is preferred wherever there is
                  * one. No age means nothing on screen was ever read — the figures are absent rather
                  * than old — and the line has to say what happens next instead of dating something
                  * that is not there.
                  */ }
                <Text text={ at > 0 ? T('Dashboard.Offline.Updated', formatAge(at)) : T('Dashboard.Offline.Message') } />

            </Vertical>

        </Panel>
    );
}
