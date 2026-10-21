import config from '../../../config.json';
import { useEffect, useMemo, useState } from 'react';
import { X, ArrowLeft, ArrowRight, House, Lock, RotateCw, Search, Settings, TriangleAlert } from 'lucide-react';
import { AnimatePresence } from 'motion/react';

import WebFrame from '../../ui/webview';
import DashboardBrowserStart from './dashboard.browser.start';
import DashboardBrowserSettings from './dashboard.browser.settings';

import Button from '../../ui/button';
import Toolbar, { ToolbarButton } from '../../ui/toolbar';
import { FieldLead, TextField } from '../../ui/field';

import { T } from '../../utility/language';
import { imageCache } from '../../core/image';
import { clearSiteIcons } from '../../core/site.icon';
import { getConnections } from '../../core/dapp';
import { disconnectAllDapps } from '../../core/dapp.rpc';
import { dappIdentity, dappScript } from '../../core/dapp.script';
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
    showSiteTheme
} from '../../core/browser';
import { useHasStatusBar } from '../../hook/platform';
import { Vertical } from '../../ui/stack';
import type { Network } from '../../type/network';
import type { BrowserFavorite, BrowserState, BrowserTab, BrowserView, BrowserVisit } from '../../type/browser';
import { Block } from '../../ui/wrap';
import Text from '../../ui/text';
import { LoadStrip } from '../../ui/progress';

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

    return `${config.searchUrl}${encodeURIComponent(trimmed)}`;
};

export default function DashboardBrowser({
    network,
    inView,
    enabled,
    request,
    ticket,
    fullToggle,
    homePress,
    onExit
}: {
    network: Network;
    /** Stays true under a dialog, which turns only `enabled` off. */
    inView: boolean;
    enabled: boolean;
    request: string;
    ticket: number;
    /** A counter, bumped per mouse press. */
    fullToggle: number;
    /** A counter, bumped per mouse double press. */
    homePress: number;
    onExit: () => void;
}) {
    const [settings, setSettings] = useState(false);
    const [view, setView] = useState<BrowserView>('mobile');
    const [visits, setVisits] = useState<BrowserVisit[]>([]);
    const [favorites, setFavorites] = useState<BrowserFavorite[]>([]);
    const [icons, setIcons] = useState({ bytes: 0, count: 0, blocked: 0 });
    const [connections, setConnections] = useState(0);
    // A list of one: the frames and the native bridges are addressed by tab.
    const [tabs, setTabs] = useState<BrowserTab[]>([{ id: 1, entries: [], index: -1, draft: '', reload: 0, home: false }]);

    const active = tabs[0].id;

    const [fullMode, setFullMode] = useState(false);
    const [seenToggle, setSeenToggle] = useState(fullToggle);
    const [seenHome, setSeenHome] = useState(homePress);

    const [live, setLive] = useState<Map<number, BrowserState>>(new Map());
    const [notice, setNotice] = useState<Map<number, string>>(new Map());

    const hasStatusBar = useHasStatusBar();

    const tab = tabs.find((item) => item.id === active) ?? tabs[0];

    const current = tab.index < 0 ? '' : tab.entries[tab.index];

    const start = atBrowserStart(tab);

    const state = live.get(tab.id);

    const native = getNativeBrowser() !== undefined;

    // Derived, so coming home never leaves a page with no chrome and no way back.
    const full = fullMode && !start;

    if (fullToggle !== seenToggle) {
        setSeenToggle(fullToggle);

        if (!start) {
            setFullMode(!full);
        }
    }

    if (homePress !== seenHome) {
        setSeenHome(homePress);

        setTabs((list) => list.map((item) => (item.id === active ? { ...item, home: true } : item)));
    }

    // Phones only: the header and status bar wear the site's colour while this tab shows it.
    useEffect(() => {
        showSiteTheme(hasStatusBar && inView && !start ? frameLabel(tab.id) : '');

        return () => {
            showSiteTheme('');
        };
    }, [hasStatusBar, inView, start, tab.id]);

    useEffect(() => {
        if (!full) {
            return undefined;
        }

        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setFullMode(false);
            }
        };

        window.addEventListener('keydown', onKey);

        return () => {
            window.removeEventListener('keydown', onKey);
        };
    }, [full]);

    const script = useMemo(() => dappScript(dappIdentity(network.chainId, 'native')), [network.chainId]);

    useEffect(() => {
        getNativeBrowser()?.setDappScript?.(script);
    }, [script]);

    const originGlyph = () => {
        if (current.startsWith('http://')) {
            return <TriangleAlert size={16} className='text-txt-error' />;
        }

        if (current.startsWith('https://')) {
            return <Lock size={14} />;
        }

        return <Search size={16} />;
    };

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

        patch(active, (item) => {
            const next = [...item.entries.slice(0, item.index + 1), url];

            return { ...item, entries: next, index: next.length - 1, draft: url, home: false };
        });

        setNotice((map) => new Map(map).set(active, ''));

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

    const onView = (chosen: BrowserView) => {
        setView(chosen);

        void setBrowserView(chosen);
    };

    const onClearCache = () => {
        const run = async () => {
            clearSiteIcons();

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
        <Vertical relative squeeze='y' grow>
            {!full && (
                <Toolbar>
                    <ToolbarButton tone='danger' onClick={onExit} icon={<X size={16} />} />

                    <ToolbarButton
                        disabled={!canBack}
                        onClick={() => {
                            onStep(-1);
                        }}
                        icon={<ArrowLeft size={16} className='rtl:rotate-180' />}
                    />

                    <ToolbarButton
                        disabled={!canForward}
                        onClick={() => {
                            onStep(1);
                        }}
                        icon={<ArrowRight size={16} className='rtl:rotate-180' />}
                    />

                    <Block squeeze='x' grow>
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
                            truncate
                            room='both'
                            textSize='tiny'
                            leading={
                                <FieldLead>
                                    {originGlyph()}

                                    {current.startsWith('http://') && (
                                        <Text as='span' variant='plain' srOnly>
                                            {T('Dashboard.Browser.Insecure')}
                                        </Text>
                                    )}
                                </FieldLead>
                            }
                            trailing={
                                <Button
                                    variant='fieldAction'
                                    onClick={() => {
                                        patch(active, (item) => ({ ...item, reload: item.reload + 1, home: false }));
                                    }}
                                    icon={<RotateCw size={16} className={state?.loading === true ? 'animate-spin' : ''} />}
                                />
                            }
                        />
                    </Block>

                    <ToolbarButton
                        onClick={
                            start
                                ? () => {
                                      setSettings(true);
                                  }
                                : onHome
                        }
                        icon={start ? <Settings size={16} /> : <House size={16} />}
                    />
                </Toolbar>
            )}

            {/* One per tab, since it remembers how far the load it is showing has got. */}
            <LoadStrip key={tab.id} hidden={full} loading={state !== undefined && state.loading} progress={state?.progress ?? 0} />

            <Block relative squeeze='y' grow>
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
                            front={front}
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
            </Block>

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
                        onView={onView}
                        onClear={onClear}
                        onClearCache={onClearCache}
                        onDisconnect={onDisconnect}
                        onClose={() => {
                            setSettings(false);
                        }}
                    />
                )}
            </AnimatePresence>
        </Vertical>
    );
}
