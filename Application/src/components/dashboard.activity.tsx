import type { Network } from '../core/network';

import { FiArrowDownLeft, FiArrowUpRight, FiInbox } from 'react-icons/fi';

import { useHistory } from '../hook/history';
import { T } from '../utility/language';
import { shortAddress, trimAmount } from '../utility/format';

/**
 * DashboardActivity - Transaction history section of the wallet tab.
 *
 * Sits directly under the token list so holdings and the movements that produced them read as one column. Renders live transactions when an indexer is wired into `useHistory`; until then it shows a plain empty state rather than inventing data.
 * @param {object} props Component props.
 * @param {string} props.address The account address.
 * @param {Network} props.network The active network.
 * @returns {JSX.Element} The activity section.
 */
export default function DashboardActivity({ address, network }: { address: string; network: Network })
{
    const { items, loading } = useHistory(address, network);

    return (
        <div className='flex flex-col gap-2'>

            <div className='text-tiny text-txt-muted'>

                { T('Dashboard.Activity.Title') }

            </div>

            {
                items.map((item) => (
                    <div
                        key={ item.hash }
                        className='glass-panel flex items-center gap-3 rounded-xl p-3'>

                        <div className='flex size-9 items-center justify-center rounded-full bg-btn-muted text-txt-normal'>

                            {
                                item.incoming ? <FiArrowDownLeft size={ 18 } /> : <FiArrowUpRight size={ 18 } />
                            }

                        </div>

                        <div className='flex-1'>

                            <div className='text-small text-txt-normal'>

                                { item.incoming ? T('Dashboard.Activity.Received') : T('Dashboard.Activity.Sent') }

                            </div>

                            <div dir='ltr' className='font-mono text-tiny text-txt-muted'>

                                { item.incoming ? shortAddress(item.from) : shortAddress(item.to) }

                            </div>

                        </div>

                        <div dir='ltr' className='font-mono text-small text-txt-normal'>

                            { `${ trimAmount(item.value) } ${ item.symbol }` }

                        </div>

                    </div>
                ))
            }

            {
                !loading && items.length === 0 &&
                (
                    <div className='glass-panel flex flex-col items-center gap-1 rounded-xl px-3 py-6 text-center'>

                        <FiInbox size={ 24 } className='text-txt-muted' />

                        <div className='text-small text-txt-muted'>

                            { T('Dashboard.Activity.Empty') }

                        </div>

                    </div>
                )
            }

        </div>
    );
}
