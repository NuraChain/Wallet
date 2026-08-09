import { HiOutlineSquares2X2 } from 'react-icons/hi2';

import Text from '../ui/text';
import Panel from '../ui/panel';

import { T } from '../../utility/language';
import { Vertical } from '../ui/stack';

/**
 * DashboardApps - Placeholder for the upcoming dApp catalogue.
 *
 * The tab is intentionally empty for now; it only reserves the slot in the navigation so the layout does not shift once the catalogue lands.
 * @returns {JSX.Element} The apps tab.
 */
export default function DashboardApps()
{
    return (
        <Vertical className='flex-1 items-center justify-center gap-3'>

            <Panel className='flex size-16 items-center justify-center rounded-2xl text-txt-muted'>

                <HiOutlineSquares2X2 size={ 28 } />

            </Panel>

            <Text
                variant='title'
                className='font-semibold'
                text={ T('Dashboard.Apps.Title') } />

            <Text
                className='max-w-60 text-center'
                text={ T('Dashboard.Apps.Soon') } />

        </Vertical>
    );
}
