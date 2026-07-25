import { HiOutlineSquares2X2 } from 'react-icons/hi2';

import { T } from '../utility/language';

/**
 * DashboardApps - Placeholder for the upcoming dApp catalogue.
 *
 * The tab is intentionally empty for now; it only reserves the slot in the navigation so the layout does not shift once the catalogue lands.
 * @returns {JSX.Element} The apps tab.
 */
export default function DashboardApps()
{
    return (
        <div className='flex flex-1 flex-col items-center justify-center gap-3'>

            <div className='glass-panel flex size-16 items-center justify-center rounded-2xl text-txt-muted'>

                <HiOutlineSquares2X2 size={ 28 } />

            </div>

            <div className='text-medium font-semibold text-txt-normal'>

                { T('Dashboard.Apps.Title') }

            </div>

            <div className='max-w-60 text-center text-tiny text-txt-muted'>

                { T('Dashboard.Apps.Soon') }

            </div>

        </div>
    );
}
