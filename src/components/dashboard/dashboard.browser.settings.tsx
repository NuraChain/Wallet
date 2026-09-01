import { useState } from 'react';
import { FiClipboard, FiLink2, FiMonitor, FiSmartphone, FiTrash2 } from 'react-icons/fi';

import Text from '../ui/text';
import Button from '../ui/button';
import ListCard from '../ui/list';
import SectionHeader from '../ui/section';
import { TextField } from '../ui/field';
import { Modal, ModalHeader } from '../ui/modal';

import { T } from '../../utility/language';
import type { BrowserView } from '../../core/browser';
import type { WalletConnectSession } from '../../core/walletconnect';
import { Horizontal, Vertical } from '../ui/stack';

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
    linkReady,
    sessions,
    onView,
    onClear,
    onClearCache,
    onDisconnect,
    onPair,
    onEndSession,
    onClose
}: {
    view: BrowserView;
    visits: number;
    icons: number;
    blocked: number;
    iconBytes: number;
    connections: number;
    linkReady: boolean;
    sessions: WalletConnectSession[];
    onView: (view: BrowserView) => void;
    onClear: () => void;
    onClearCache: () => void;
    onDisconnect: () => void;
    onPair: (uri: string) => Promise<string>;
    onEndSession: (topic: string) => void;
    onClose: () => void;
}) {
    const [uri, setUri] = useState('');
    const [notice, setNotice] = useState('');
    const [pairing, setPairing] = useState(false);

    const onSubmit = () => {
        const value = uri.trim();

        if (value.length === 0 || pairing) {
            return;
        }

        setPairing(true);
        setNotice('');

        void onPair(value).then((failed) => {
            setPairing(false);
            setNotice(failed);

            if (failed.length === 0) {
                setUri('');
            }
        });
    };

    // A pairing is nearly always copied rather than typed: it arrives from a QR reader, a chat, or
    // the dApp's own copy button, and it is far too long to retype.
    const onPaste = () => {
        void navigator.clipboard
            .readText()
            .then((value) => {
                setUri(value.trim());
                setNotice('');
            })
            .catch(() => {
                setNotice(T('Dashboard.Browser.LinkPasteFailed'));
            });
    };

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

            <SectionHeader title={T('Dashboard.Browser.Link')} />

            {linkReady ? (
                <>
                    <Text text={T('Dashboard.Browser.LinkNote')} />

                    <TextField
                        dir='ltr'
                        value={uri}
                        error={notice}
                        placeholder={T('Dashboard.Browser.LinkPlaceholder')}
                        onValue={(value) => {
                            setUri(value);
                            setNotice('');
                        }}
                        onEnter={onSubmit}
                        className='truncate text-tiny'
                    />

                    <Horizontal className='gap-2 *:flex-1'>
                        <Button variant='muted' size='action' onClick={onPaste}>
                            <FiClipboard size={16} className='shrink-0' />

                            {T('Dashboard.Browser.LinkPaste')}
                        </Button>

                        <Button variant='primary' size='action' loading={pairing} disabled={uri.trim().length === 0 || pairing} onClick={onSubmit}>
                            <FiLink2 size={16} className='shrink-0' />

                            {T('Dashboard.Browser.LinkPair')}
                        </Button>
                    </Horizontal>
                </>
            ) : (
                <Text text={T('Dashboard.Browser.LinkOff')} />
            )}

            {sessions.length > 0 && (
                <ListCard>
                    {sessions.map((session) => (
                        <Horizontal key={session.topic} className='items-center justify-between gap-2 p-3'>
                            <Vertical className='min-w-0 gap-0.5'>
                                <Text variant='body' className='truncate' text={session.name.length > 0 ? session.name : session.url} />

                                <Text dir='ltr' className='truncate' text={session.url} />
                            </Vertical>

                            <Button
                                dim
                                variant='danger'
                                size='iconChip'
                                aria-label={T('Dashboard.Browser.LinkEnd')}
                                onClick={() => {
                                    onEndSession(session.topic);
                                }}
                                className='shrink-0'
                            >
                                <FiTrash2 size={16} />
                            </Button>
                        </Horizontal>
                    ))}
                </ListCard>
            )}

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
