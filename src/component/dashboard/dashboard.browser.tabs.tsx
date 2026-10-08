import { Globe } from 'lucide-react';
import { AnimatePresence } from 'motion/react';

import SiteIcon from '../site.icon';

import { T } from '../../utility/language';
import { getSiteHost } from '../../core/browser';

import type { BrowserState, BrowserTab } from '../../type/browser';
import { Grid } from '../../ui/wrap';
import { TabAdd, TabCard } from '../../ui/tabs';

/**
 * The open tabs, as a section of the browser's start page: a card for each, the way a phone lays
 * its tabs out, to go back to one, close it, or open another.
 */
export default function DashboardBrowserTabs({
    tabs,
    active,
    states,
    onPick,
    onClose,
    onAdd
}: {
    tabs: BrowserTab[];
    active: number;
    /** What each tab's page last said of itself; only a native browser reports a title. */
    states: Map<number, BrowserState>;
    onPick: (id: number) => void;
    onClose: (id: number) => void;
    onAdd: () => void;
}) {
    return (
        <Grid look='tabs'>
            {/* The cards already there when the section opens are not arriving, so only one that is
                closed or opened while it is on show animates. */}
            <AnimatePresence initial={false}>
                {tabs.map((item) => {
                    const url = item.index < 0 ? '' : item.entries[item.index];

                    const name = url.length > 0 ? getSiteHost(url) : T('Dashboard.Browser.TabEmpty');

                    return (
                        <TabCard
                            key={item.id}
                            active={item.id === active}
                            name={name}
                            title={url.length > 0 ? (states.get(item.id)?.title ?? '') : ''}
                            hint={url.length > 0 ? url : name}
                            art={
                                url.length > 0 ? (
                                    <SiteIcon primary url={url} symbol={name.toUpperCase()} size={9} />
                                ) : (
                                    <Globe size={20} className='text-txt-muted' />
                                )
                            }
                            onPick={() => {
                                onPick(item.id);
                            }}
                            onClose={() => {
                                onClose(item.id);
                            }}
                        />
                    );
                })}
            </AnimatePresence>

            <TabAdd label={T('Dashboard.Browser.TabNew')} onAdd={onAdd} />
        </Grid>
    );
}
