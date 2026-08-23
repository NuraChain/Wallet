import { FiMonitor, FiSmartphone, FiTrash2 } from 'react-icons/fi';

import Text from '../ui/text';
import Button from '../ui/button';
import { Modal, ModalActions, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import type { BrowserView } from '../../core/browser';
import { Horizontal } from '../ui/stack';

/**
 * The two layouts, as the segmented control renders them.
 *
 * A pair rather than a toggle: a switch labelled "desktop" has to be read to know what it does now,
 * while two controls show which one is on and what the other one is at the same time.
 */
const viewMap: { view: BrowserView; label: string; icon: typeof FiMonitor }[] =
[
    { view: 'mobile', label: 'Dashboard.Browser.ViewMobile', icon: FiSmartphone },
    { view: 'desktop', label: 'Dashboard.Browser.ViewDesktop', icon: FiMonitor }
];

/**
 * readableSize - Bytes as the shortest unit that still reads as a number.
 *
 * Local to this dialog rather than in `format.ts`: it is the only place in the app that shows a size,
 * and the general formatters there are the ones several screens share.
 * @param {number} bytes The size in bytes.
 * @returns {string} A short human-readable size.
 */
const readableSize = (bytes: number) =>
{
    if (bytes < 1024)
    {
        return `${ bytes } B`;
    }

    if (bytes < 1024 * 1024)
    {
        return `${ Math.round(bytes / 1024) } KB`;
    }

    return `${ (bytes / (1024 * 1024)).toFixed(1) } MB`;
};

/**
 * DashboardBrowserSettings - The browser tab's own settings: which layout sites are asked for, the visited list, and the icons kept for them.
 *
 * Separate from the app's settings dialog because nothing here is about the wallet — it is the state
 * of one tab, reached from the gear on that tab's start screen, and it is the only dialog that opens
 * over a surface a real browser view can occupy. That is safe as long as it stays reachable from the
 * start screen only: with no page open there is no native view painted over the layout to hide it.
 * @param {object} props Component props.
 * @param {BrowserView} props.view The layout sites are currently asked for.
 * @param {number} props.visits How many sites the visited list holds.
 * @param {number} props.icons How many site icons are cached.
 * @param {number} props.blocked How many addresses are being left alone after refusing to be read.
 * @param {number} props.iconBytes How much disk those icons take.
 * @param {number} props.connections How many sites may currently see an account.
 * @param {(view: BrowserView) => void} props.onView Switches the layout.
 * @param {() => void} props.onClear Forgets every visit.
 * @param {() => void} props.onClearCache Drops the cached site icons.
 * @param {() => void} props.onDisconnect Withdraws every site's access to the wallet.
 * @param {() => void} props.onClose Closes the dialog.
 * @returns {JSX.Element} The browser settings dialog.
 */
export default function DashboardBrowserSettings({ view, visits, icons, blocked, iconBytes, connections, onView, onClear, onClearCache, onDisconnect, onClose }: { view: BrowserView; visits: number; icons: number; blocked: number; iconBytes: number; connections: number; onView: (view: BrowserView) => void; onClear: () => void; onClearCache: () => void; onDisconnect: () => void; onClose: () => void })
{
    return (
        <Modal
            scroll
            onClose={ onClose }>

            <ModalHeader
                title={ T('Dashboard.Browser.Settings') }
                onClose={ onClose } />

            <Text text={ T('Dashboard.Browser.View') } />

            <Horizontal className='gap-2 *:flex-1'>

                {
                    viewMap.map((item) => (
                        <Button
                            key={ item.view }
                            variant={ item.view === view ? 'primary' : 'muted' }
                            size='action'
                            disabled={ item.view === view }
                            onClick={ () => { onView(item.view); } }
                            className='disabled:cursor-default!'>

                            <item.icon size={ 16 } className='shrink-0' />

                            { T(item.label) }

                        </Button>
                    ))
                }

            </Horizontal>

            <Text text={ T('Dashboard.Browser.ViewNote') } />

            <Text text={ T('Dashboard.Browser.Connected') } />

            { /*
              * The only way back out of a connection, which is why it is here at all: a grant is given
              * to a site from inside that site's own page, and EIP-2255 leaves withdrawing it to the
              * wallet. Without this the user could connect and never disconnect.
              *
              * Disconnecting does not reload anything. A page that is holding an account is told it no
              * longer has one through `accountsChanged`, which is what every dApp already listens for.
              */ }
            <Text
                variant='body'
                text={ T('Dashboard.Browser.ConnectedCount', String(connections)) } />

            <Text text={ T('Dashboard.Browser.ConnectedNote') } />

            <ModalActions>

                <Button
                    dim
                    variant='danger'
                    size='action'
                    disabled={ connections === 0 }
                    onClick={ onDisconnect }>

                    <FiTrash2 size={ 16 } className='shrink-0' />

                    { T('Dashboard.Browser.ConnectedClear') }

                </Button>

            </ModalActions>

            <Text text={ T('Dashboard.Browser.History') } />

            { /*
              * The count is the whole state of the list, and it is what says whether clearing would
              * do anything — so the button is disabled at zero rather than clearing nothing.
              */ }
            <Text
                variant='body'
                text={ T('Dashboard.Browser.HistoryCount', String(visits)) } />

            <ModalActions>

                <Button
                    dim
                    variant='danger'
                    size='action'
                    disabled={ visits === 0 }
                    onClick={ onClear }>

                    <FiTrash2 size={ 16 } className='shrink-0' />

                    { T('Dashboard.Browser.Clear') }

                </Button>

            </ModalActions>

            <Text text={ T('Dashboard.Browser.Cache') } />

            { /*
              * Unlike the visited list above, the count here is not the whole state. What the cache
              * holds is only half of it: a favicon the origin policy refused was never stored, so on
              * this screen the thing most worth clearing is precisely the thing this line cannot show.
              * That is why `blocked` sits beside the count in deciding whether the button does
              * anything, and why it is disabled only when there is neither — "0 icons, 0 B" next to a
              * live button means refusals, which is the honest reading and not a stuck control.
              */ }
            <Text
                variant='body'
                text={ T('Dashboard.Browser.CacheSize', String(icons), readableSize(iconBytes)) } />

            { /*
              * Said plainly because the button does less than its name suggests everywhere else: this
              * clears the icons the wallet fetched for these tiles, not the page cache the browser view
              * keeps for the sites themselves, which no web API can reach into.
              */ }
            <Text text={ T('Dashboard.Browser.CacheNote') } />

            <ModalActions>

                <Button
                    dim
                    variant='danger'
                    size='action'
                    disabled={ icons === 0 && blocked === 0 }
                    onClick={ onClearCache }>

                    <FiTrash2 size={ 16 } className='shrink-0' />

                    { T('Dashboard.Browser.CacheClear') }

                </Button>

            </ModalActions>

        </Modal>
    );
}
