import { FiMonitor, FiSmartphone, FiTrash2 } from 'react-icons/fi';

import Text from '../ui/text';
import Button from '../ui/button';
import SectionHeader from '../ui/section';
import { Modal, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import type { BrowserView } from '../../core/browser';
import { Horizontal } from '../ui/stack';

const viewMap: { view: BrowserView; label: string; icon: typeof FiMonitor }[] = [
    { view: 'mobile', label: 'Dashboard.Browser.ViewMobile', icon: FiSmartphone },
    { view: 'desktop', label: 'Dashboard.Browser.ViewDesktop', icon: FiMonitor }
];

const readableSize = (bytes: number) => {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${Math.round(bytes / 1024)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function DashboardBrowserSettings({
    view,
    visits,
    icons,
    blocked,
    iconBytes,
    connections,
    onView,
    onClear,
    onClearCache,
    onDisconnect,
    onClose
}: {
    view: BrowserView;
    visits: number;
    icons: number;
    blocked: number;
    iconBytes: number;
    connections: number;
    onView: (view: BrowserView) => void;
    onClear: () => void;
    onClearCache: () => void;
    onDisconnect: () => void;
    onClose: () => void;
}) {
    return (
        <Modal scroll onClose={onClose}>
            <ModalHeader title={T('Dashboard.Browser.Settings')} onClose={onClose} />

            <SectionHeader title={T('Dashboard.Browser.View')} />

            <Horizontal className='gap-2 *:flex-1'>
                {viewMap.map((item) => (
                    <Button
                        key={item.view}
                        variant={item.view === view ? 'primary' : 'muted'}
                        size='action'
                        disabled={item.view === view}
                        onClick={() => {
                            onView(item.view);
                        }}
                        className='disabled:cursor-default!'
                    >
                        <item.icon size={16} className='shrink-0' />

                        {T(item.label)}
                    </Button>
                ))}
            </Horizontal>

            <Text text={T('Dashboard.Browser.ViewNote')} />

            <SectionHeader title={T('Dashboard.Browser.Connected')} />

            <Text variant='body' text={T('Dashboard.Browser.ConnectedCount', String(connections))} />

            <Text text={T('Dashboard.Browser.ConnectedNote')} />

            <Horizontal className='gap-2 *:flex-1'>
                <Button dim variant='danger' size='action' disabled={connections === 0} onClick={onDisconnect}>
                    <FiTrash2 size={16} className='shrink-0' />

                    {T('Dashboard.Browser.ConnectedClear')}
                </Button>
            </Horizontal>

            <SectionHeader title={T('Dashboard.Browser.History')} />

            <Text variant='body' text={T('Dashboard.Browser.HistoryCount', String(visits))} />

            <Horizontal className='gap-2 *:flex-1'>
                <Button dim variant='danger' size='action' disabled={visits === 0} onClick={onClear}>
                    <FiTrash2 size={16} className='shrink-0' />

                    {T('Dashboard.Browser.Clear')}
                </Button>
            </Horizontal>

            <SectionHeader title={T('Dashboard.Browser.Cache')} />

            <Text variant='body' text={T('Dashboard.Browser.CacheSize', String(icons), readableSize(iconBytes))} />

            <Text text={T('Dashboard.Browser.CacheNote')} />

            <Horizontal className='gap-2 *:flex-1'>
                <Button dim variant='danger' size='action' disabled={icons === 0 && blocked === 0} onClick={onClearCache}>
                    <FiTrash2 size={16} className='shrink-0' />

                    {T('Dashboard.Browser.CacheClear')}
                </Button>
            </Horizontal>
        </Modal>
    );
}
