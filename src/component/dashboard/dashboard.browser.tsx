import { useEffect, useMemo, useRef, useState } from 'react';
import { X, ArrowLeft, ArrowRight, House, Lock, RotateCw, Search, Settings, TriangleAlert } from 'lucide-react';
import { AnimatePresence } from 'motion/react';

import WebFrame from '../../ui/webview';
import DashboardBrowserStart from './dashboard.browser.start';
import DashboardBrowserSettings from './dashboard.browser.settings';

import Button from '../../ui/button';
import Toolbar from '../../ui/toolbar';
import { FieldLead, TextField } from '../../ui/field';

import { T } from '../../utility/language';
import { imageCache } from '../../core/image';
import { clearSiteIcons } from '../../core/site.icon';
import { getConnections } from '../../core/dapp';
import { forgetDappPage } from '../../core/dapp.bridge';
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
    setBrowserView
} from '../../core/browser';
import { Vertical } from '../../ui/stack';
import type { Network } from '../../type/network';
import type { BrowserFavorite, BrowserSection, BrowserState, BrowserTab, BrowserView, BrowserVisit } from '../../type/browser';
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

    return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
};

export default function DashboardBrowser({
    network,
    enabled,
    request,
    ticket,
    fullToggle,
    homePress,
    onExit,
    onFullscreen
}: {
    network: Network;
    enabled: boolean;
    request: string;
    ticket: number;
    /** Counts up once per press of the floating mouse while this tab is showing. */
    fullToggle: number;
    /** Counts up once per double press of the floating mouse while this tab is showing. */
    homePress: number;
    onExit: () => void;
    onFullscreen?: (on: boolean) => void;
}) {
    const [settings, setSettings] = useState(false);
    const [view, setView] = useState<BrowserView>('mobile');
    const [visits, setVisits] = useState<BrowserVisit[]>([]);
    const [favorites, setFavorites] = useState<BrowserFavorite[]>([]);
    const [icons, setIcons] = useState({ bytes: 0, count: 0, blocked: 0 });
    const [connections, setConnections] = useState(0);
    const [active, setActive] = useState(1);
    const [tabs, setTabs] = useState<BrowserTab[]>([{ id: 1, entries: [], index: -1, draft: '', reload: 0, home: false }]);

    // Which part of the start page is on show. Kept here because every tab draws its own copy of
    // that page: one held there would fall back to the favourites each time a tab was closed.
    const [section, setSection] = useState<BrowserSection>('favorite');

    const mintRef = useRef(2);

    const [fullMode, setFullMode] = useState(false);
    const [seenToggle, setSeenToggle] = useState(fullToggle);
    const [seenHome, setSeenHome] = useState(homePress);

    const [live, setLive] = useState<Map<number, BrowserState>>(new Map());
    const [notice, setNotice] = useState<Map<number, string>>(new Map());

    const tab = tabs.find((item) => item.id === active) ?? tabs[0];

    const current = tab.index < 0 ? '' : tab.entries[tab.index];

    const start = atBrowserStart(tab);

    const state = live.get(tab.id);

    const native = getNativeBrowser() !== undefined;

    /* The home page is the wallet's own, so there is nothing to go full screen for. Deriving the
       mode rather than storing it keeps a tab that went full screen from coming home to a page with
       no chrome and no way to bring it back, while still remembering the intent for when a site is
       opened again. */
    const full = fullMode && !start;

    // Acted on once per count, during render rather than after it, and only over a site: on the
    // home page there is nothing to hide.
    if (fullToggle !== seenToggle) {
        setSeenToggle(fullToggle);

        if (!start) {
            setFullMode(!full);
        }
    }

    // A double press comes home the way the Home button does, which also lifts full screen off the page.
    if (homePress !== seenHome) {
        setSeenHome(homePress);

        setTabs((list) => list.map((item) => (item.id === active ? { ...item, home: true } : item)));
    }

    useEffect(() => {
        onFullscreen?.(full);
    }, [full, onFullscreen]);

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

    /* The field used to lead with a magnifier whatever it was pointing at, so a wallet's own
       browser said nothing about whether the page asking to sign was served over TLS. */
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

        setSection('favorite');

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

    // Leaving the start page for a site, or for a new tab's own start page, puts it back on the
    // favourites for the next time it is opened.
    const onPickTab = (id: number) => {
        setActive(id);

        patch(id, (item) => ({ ...item, home: false }));

        setSection('favorite');
    };

    const onAddTab = () => {
        const id = mintRef.current;

        mintRef.current += 1;

        setTabs([...tabs, { id, entries: [], index: -1, draft: '', reload: 0, home: false }]);

        setActive(id);

        setSection('favorite');
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
        } else if (id === active) {
            // Closed from the list on the start page, so the tab that takes over is left on that
            // page too: the list stays where it was instead of giving way to a site.
            const next = rest[Math.max(0, at - 1)].id;

            setTabs(rest.map((item) => (item.id === next && item.index >= 0 ? { ...item, home: true } : item)));

            setActive(next);
        } else {
            setTabs(rest);
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
                    <Button variant='danger' size='iconChip' onClick={onExit} shrink={false} wide='hide' icon={<X size={16} />} />

                    <Button
                        dim
                        variant='chip'
                        size='iconChip'
                        disabled={!canBack}
                        onClick={() => {
                            onStep(-1);
                        }}
                        shrink={false}
                        icon={<ArrowLeft size={16} className='rtl:rotate-180' />}
                    />

                    <Button
                        dim
                        variant='chip'
                        size='iconChip'
                        disabled={!canForward}
                        onClick={() => {
                            onStep(1);
                        }}
                        shrink={false}
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

                    <Button
                        variant='chip'
                        size='iconChip'
                        onClick={
                            start
                                ? () => {
                                      setSettings(true);
                                  }
                                : onHome
                        }
                        shrink={false}
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
                                    section={section}
                                    favorites={favorites}
                                    tabs={tabs}
                                    active={active}
                                    states={live}
                                    visits={visits}
                                    notice={notice.get(item.id) ?? ''}
                                    onSection={setSection}
                                    onOpen={onOpen}
                                    onPickTab={onPickTab}
                                    onCloseTab={onCloseTab}
                                    onAddTab={onAddTab}
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
