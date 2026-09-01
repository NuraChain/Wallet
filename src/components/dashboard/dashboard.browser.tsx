import type { Network } from '../../core/network';

import { useEffect, useMemo, useRef, useState } from 'react';
import { IoClose } from 'react-icons/io5';
import { AnimatePresence, motion } from 'motion/react';
import { FiArrowLeft, FiArrowRight, FiHome, FiRotateCw, FiSearch, FiSettings } from 'react-icons/fi';

import WebFrame from '../../layout/webview';
import DashboardBrowserTabs from './dashboard.browser.tabs';
import DashboardBrowserStart from './dashboard.browser.start';
import DashboardBrowserSettings from './dashboard.browser.settings';

import Button from '../ui/button';
import ProgressBar from '../ui/progress';
import { TextField } from '../ui/field';

import { cn } from '../../utility/cn';
import { T } from '../../utility/language';
import { imageCache } from '../../core/image';
import { getConnections } from '../../core/dapp';
import { forgetDappPage } from '../../core/dapp.bridge';
import { disconnectAllDapps } from '../../core/dapp.rpc';
import { dappIdentity, dappScript } from '../../core/dapp.script';
import { disconnectWalletConnect, pairWalletConnect, useWalletConnectSessions, walletConnectConfigured } from '../../core/walletconnect';
import {
    addBrowserVisit,
    atBrowserStart,
    clearBrowserHistory,
    frameLabel,
    getBrowserFavorites,
    getBrowserHistory,
    getBrowserView,
    getNativeBrowser,
    getNativeTab,
    onNativeBrowserState,
    setBrowserFavorites,
    setBrowserView,
    type BrowserFavorite,
    type BrowserState,
    type BrowserTab,
    type BrowserVisit,
    type BrowserView
} from '../../core/browser';
import { Horizontal, Vertical } from '../ui/stack';

const toUrl = (value: string) => {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
        return '';
    }

    if (/^https?:\/\//iu.test(trimmed)) {
        return trimmed;
    }

    if (/^[^\s/]+\.[^\s]{2,}/u.test(trimmed)) {
        return `https://${trimmed}`;
    }

    return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
};

export default function DashboardBrowser({
    network,
    enabled,
    request,
    ticket,
    onExit
}: {
    network: Network;
    enabled: boolean;
    request: string;
    ticket: number;
    onExit: () => void;
}) {
    const [settings, setSettings] = useState(false);
    const [view, setView] = useState<BrowserView>('mobile');
    const [visits, setVisits] = useState<BrowserVisit[]>([]);
    const [favorites, setFavorites] = useState<BrowserFavorite[]>([]);
    const [icons, setIcons] = useState({ bytes: 0, count: 0, blocked: 0 });
    const [connections, setConnections] = useState(0);
    const [active, setActive] = useState(1);
    const [tabs, setTabs] = useState<BrowserTab[]>([{ id: 1, entries: [], index: -1, draft: '', reload: 0, home: false }]);

    const mintRef = useRef(2);

    const [live, setLive] = useState<Map<number, BrowserState>>(new Map());
    const [notice, setNotice] = useState<Map<number, string>>(new Map());

    const linked = useWalletConnectSessions();

    const tab = tabs.find((item) => item.id === active) ?? tabs[0];

    const current = tab.index < 0 ? '' : tab.entries[tab.index];

    const start = atBrowserStart(tab);

    const state = live.get(tab.id);

    const native = getNativeBrowser() !== undefined;

    const script = useMemo(() => dappScript(dappIdentity(network.chainId)), [network.chainId]);

    useEffect(() => {
        getNativeBrowser()?.setDappScript?.(script);
    }, [script]);

    const canBack = tab.home || (native ? state?.canBack === true : tab.index >= 0);
    const canForward = native ? state?.canForward === true : tab.index < tab.entries.length - 1;

    const patch = (id: number, change: (item: BrowserTab) => BrowserTab) => {
        setTabs((list) => list.map((item) => (item.id === id ? change(item) : item)));
    };

    useEffect(
        () =>
            onNativeBrowserState((update) => {
                const target = update.id === undefined ? active : tabs.find((item) => frameLabel(item.id) === update.id)?.id;

                if (target === undefined) {
                    return;
                }

                setLive((map) => new Map(map).set(target, update));

                if (update.url.length > 0) {
                    patch(target, (item) => ({ ...item, draft: update.url }));
                }
            }),
        [tabs, active]
    );

    useEffect(() => {
        const load = async () => {
            setView(await getBrowserView());
            setVisits(await getBrowserHistory());
            setFavorites(await getBrowserFavorites());
        };

        void load();
    }, []);

    useEffect(() => {
        if (!settings) {
            return;
        }

        void imageCache.getCacheSize('unknown').then(setIcons);

        setConnections(getConnections().length);
    }, [settings]);

    const onOpen = (value: string) => {
        const url = toUrl(value);

        if (url.length === 0) {
            return;
        }

        const spawn = tab.home && tab.index >= 0;

        const id = spawn ? mintRef.current : active;

        if (spawn) {
            mintRef.current += 1;

            setTabs([...tabs, { id, entries: [url], index: 0, draft: url, reload: 0, home: false }]);

            setActive(id);
        } else {
            patch(active, (item) => {
                const next = [...item.entries.slice(0, item.index + 1), url];

                return { ...item, entries: next, index: next.length - 1, draft: url, home: false };
            });
        }

        setNotice((map) => new Map(map).set(id, ''));

        void addBrowserVisit(url).then(setVisits);
    };

    useEffect(() => {
        if (ticket > 0 && request.length > 0) {
            onOpen(request);
        }
    }, [ticket, request]);

    const onStep = (offset: number) => {
        if (tab.home && offset < 0) {
            patch(active, (item) => ({ ...item, home: false }));

            return;
        }

        const bridge = getNativeTab(frameLabel(active));

        if (bridge !== undefined) {
            if (offset < 0) {
                bridge.back();
            } else {
                bridge.forward();
            }

            return;
        }

        const next = tab.index + offset;

        if (next < 0 || next >= tab.entries.length) {
            return;
        }

        patch(active, (item) => ({ ...item, index: next, draft: item.entries[next], home: false }));
    };

    const onHome = () => {
        patch(active, (item) => ({ ...item, home: true }));
    };

    const onPickTab = (id: number) => {
        setActive(id);

        patch(id, (item) => ({ ...item, home: false }));
    };

    const onAddTab = () => {
        const id = mintRef.current;

        mintRef.current += 1;

        setTabs([...tabs, { id, entries: [], index: -1, draft: '', reload: 0, home: false }]);

        setActive(id);
    };

    const onCloseTab = (id: number) => {
        const at = tabs.findIndex((item) => item.id === id);

        if (at === -1) {
            return;
        }

        const rest = tabs.filter((item) => item.id !== id);

        if (rest.length === 0) {
            const fresh = mintRef.current;

            mintRef.current += 1;

            setTabs([{ id: fresh, entries: [], index: -1, draft: '', reload: 0, home: false }]);

            setActive(fresh);
        } else {
            setTabs(rest);

            if (id === active) {
                setActive(rest[Math.max(0, at - 1)].id);
            }
        }

        setLive((map) => {
            const next = new Map(map);
            next.delete(id);
            return next;
        });
        setNotice((map) => {
            const next = new Map(map);
            next.delete(id);
            return next;
        });

        forgetDappPage(frameLabel(id));
    };

    const onView = (chosen: BrowserView) => {
        setView(chosen);

        void setBrowserView(chosen);
    };

    const onClearCache = () => {
        const run = async () => {
            await imageCache.clearKind('unknown');

            setIcons(await imageCache.getCacheSize('unknown'));
        };

        void run();
    };

    const onClear = () => {
        const run = async () => {
            setVisits([]);

            await clearBrowserHistory();

            setIcons(await imageCache.getCacheSize('unknown'));
        };

        void run();
    };

    const onDisconnect = () => {
        const run = async () => {
            await disconnectAllDapps();

            setConnections(0);
        };

        void run();
    };

    const onPair = async (uri: string) => {
        try {
            await pairWalletConnect(uri);
        } catch (cause) {
            return cause instanceof Error ? cause.message : String(cause);
        }

        // The proposal that follows is a dialog of its own, and this sheet would sit on top of it.
        setSettings(false);

        return '';
    };

    const onEndSession = (topic: string) => {
        void disconnectWalletConnect(topic);
    };

    const onFavorites = (next: BrowserFavorite[]) => {
        setFavorites(next);

        void setBrowserFavorites(next);
    };

    const onFavoriteSave = (item: BrowserFavorite) => {
        onFavorites(favorites.some((held) => held.id === item.id) ? favorites.map((held) => (held.id === item.id ? item : held)) : [...favorites, item]);
    };

    const onFavoriteRemove = (id: string) => {
        onFavorites(favorites.filter((item) => item.id !== id));
    };

    return (
        <Vertical className='relative min-h-0 flex-1'>
            <Horizontal className='shrink-0 items-center gap-1.5 border-b border-line bg-base-1 p-2'>
                <Button variant='danger' size='iconChip' aria-label={T('Dashboard.Browser.Exit')} onClick={onExit} className='shrink-0 lg:hidden'>
                    <IoClose size={16} />
                </Button>

                <Button
                    dim
                    variant='chip'
                    size='iconChip'
                    disabled={!canBack}
                    aria-label={T('Dashboard.Browser.Back')}
                    onClick={() => {
                        onStep(-1);
                    }}
                    className='shrink-0'
                >
                    <FiArrowLeft size={16} className='rtl:rotate-180' />
                </Button>

                <Button
                    dim
                    variant='chip'
                    size='iconChip'
                    disabled={!canForward}
                    aria-label={T('Dashboard.Browser.Forward')}
                    onClick={() => {
                        onStep(1);
                    }}
                    className='shrink-0'
                >
                    <FiArrowRight size={16} className='rtl:rotate-180' />
                </Button>

                <div className='min-w-0 flex-1'>
                    <TextField
                        dir={tab.draft.length > 0 ? 'ltr' : undefined}
                        value={tab.draft}
                        placeholder={T('Dashboard.Browser.Placeholder')}
                        onValue={(value) => {
                            patch(active, (item) => ({ ...item, draft: value }));
                        }}
                        onEnter={() => {
                            onOpen(tab.draft);
                        }}
                        size='compact'
                        className='truncate ps-10 pe-10 text-tiny'
                        leading={<FiSearch size={16} className='pointer-events-none absolute inset-s-3 text-txt-muted' />}
                        trailing={
                            current.length > 0 ? (
                                <Button
                                    size='icon'
                                    aria-label={T('Dashboard.Browser.Reload')}
                                    onClick={() => {
                                        patch(active, (item) => ({ ...item, reload: item.reload + 1, home: false }));
                                    }}
                                    className='absolute inset-e-1 cursor-pointer text-txt-muted hover:text-txt-normal'
                                >
                                    <FiRotateCw size={16} className={state?.loading === true ? 'animate-spin' : ''} />
                                </Button>
                            ) : undefined
                        }
                    />
                </div>

                <Button
                    variant='chip'
                    size='iconChip'
                    aria-label={T(start ? 'Dashboard.Browser.Settings' : 'Dashboard.Browser.Home')}
                    onClick={
                        start
                            ? () => {
                                  setSettings(true);
                              }
                            : onHome
                    }
                    className='shrink-0'
                >
                    {start ? <FiSettings size={16} /> : <FiHome size={16} />}
                </Button>
            </Horizontal>

            {start && <DashboardBrowserTabs tabs={tabs} active={active} onPick={onPickTab} onClose={onCloseTab} onAdd={onAddTab} />}

            <div className='relative h-0.5 shrink-0 overflow-hidden'>
                <AnimatePresence>
                    {state !== undefined && state.loading && (
                        <motion.div key='progress' initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className='absolute inset-0'>
                            <ProgressBar value={state.progress} label={T('Dashboard.Browser.Loading')} className='size-full' />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className='relative min-h-0 flex-1'>
                {tabs.map((item) => {
                    const front = item.id === active;

                    const shown = front && !atBrowserStart(item);

                    return (
                        <WebFrame
                            key={item.id}
                            url={item.index < 0 ? '' : item.entries[item.index]}
                            label={frameLabel(item.id)}
                            enabled={enabled && shown}
                            desktop={view === 'desktop'}
                            reload={item.reload}
                            script={script}
                            title={T('Dashboard.Browser.Title')}
                            onFallback={(value) => {
                                setNotice((map) => new Map(map).set(item.id, value));
                            }}
                            className={cn('absolute inset-0 overflow-hidden bg-base-1', front ? 'visible' : 'invisible')}
                        >
                            {front && !shown ? (
                                <DashboardBrowserStart
                                    favorites={favorites}
                                    visits={visits}
                                    notice={notice.get(item.id) ?? ''}
                                    onOpen={onOpen}
                                    onFavoriteSave={onFavoriteSave}
                                    onFavoriteRemove={onFavoriteRemove}
                                />
                            ) : undefined}
                        </WebFrame>
                    );
                })}
            </div>

            <AnimatePresence>
                {settings && (
                    <DashboardBrowserSettings
                        key='browser-settings'
                        view={view}
                        visits={visits.length}
                        icons={icons.count}
                        blocked={icons.blocked}
                        iconBytes={icons.bytes}
                        connections={connections}
                        linkReady={walletConnectConfigured()}
                        sessions={linked}
                        onView={onView}
                        onClear={onClear}
                        onClearCache={onClearCache}
                        onDisconnect={onDisconnect}
                        onPair={onPair}
                        onEndSession={onEndSession}
                        onClose={() => {
                            setSettings(false);
                        }}
                    />
                )}
            </AnimatePresence>
        </Vertical>
    );
}
