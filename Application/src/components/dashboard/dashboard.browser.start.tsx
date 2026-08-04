import Text from '../ui/text';
import Alert from '../ui/alert';
import Button from '../ui/button';
import EmptyState from '../ui/state';
import TokenIcon from '../token.icon';
import SectionHeader from '../ui/section';

import { T } from '../../utility/language';
import { getSiteHost, getSiteIcon, type BrowserVisit } from '../../core/browser';

/**
 * DashboardBrowserStart - What a tab shows before it has been given an address.
 *
 * Its own component because the browser holds a frame per tab now, and leaving this inline would have
 * nested ninety lines of start screen inside that loop for the one tab in front to render.
 *
 * Two lists, both shortcuts and both shared by every tab: the suggested sites, which are fixed, and
 * the visited ones, which are what this wallet has opened before. Neither is the per-tab back stack
 * the toolbar arrows walk.
 * @param {object} props Component props.
 * @param {{ name: string; url: string }[]} props.suggested The fixed shortcuts, already resolved against the active network.
 * @param {BrowserVisit[]} props.visits The visited sites, newest first.
 * @param {string} props.notice Why the native view could not be created, when it could not be.
 * @param {(url: string) => void} props.onOpen Opens an address in this tab.
 * @returns {JSX.Element} The start screen.
 */
export default function DashboardBrowserStart({ suggested, visits, notice, onOpen }: { suggested: { name: string; url: string }[]; visits: BrowserVisit[]; notice: string; onOpen: (url: string) => void })
{
    return (
        <div className='flex size-full flex-col gap-3 overflow-y-auto p-4'>

            <SectionHeader title={ T('Dashboard.Browser.Suggested') } />

            <div className='grid grid-cols-2 gap-2'>

                {
                    suggested.map((item) => (
                        <Button
                            key={ item.url }
                            variant='muted'
                            onClick={ () => { onOpen(item.url); } }
                            className='h-14 gap-3 rounded-xl px-3 text-start'>

                            { /*
                              * The site's own icon, with its initial underneath for the ones that
                              * answer with nothing — the same treatment a token gets in the holdings
                              * list, and the same component drawing it.
                              */ }
                            <TokenIcon
                                primary
                                kind='unknown'
                                src={ getSiteIcon(item.url) }
                                symbol={ item.name }
                                className='size-8 text-tiny' />

                            <Text
                                variant='body'
                                className='flex-1 truncate'
                                text={ item.name } />

                        </Button>
                    ))
                }

            </div>

            <SectionHeader title={ T('Dashboard.Browser.Recent') } />

            {
                visits.length === 0 ?
                    <EmptyState panel text={ T('Dashboard.Browser.RecentEmpty') } /> :
                    (
                        <div className='grid grid-cols-2 gap-2'>

                            {
                                visits.map((item) => (
                                    <Button
                                        key={ item.url }
                                        title={ item.url }
                                        variant='muted'
                                        onClick={ () => { onOpen(item.url); } }
                                        className='h-14 gap-3 rounded-xl px-3 text-start'>

                                        <TokenIcon
                                            kind='unknown'
                                            src={ getSiteIcon(item.url) }
                                            symbol={ getSiteHost(item.url).toUpperCase() }
                                            className='size-8 text-tiny' />

                                        { /*
                                          * The host alone names the row, which is what makes two of
                                          * these fit on a line. The full address used to sit under it
                                          * and cannot survive half a row — it truncated to an ellipsis
                                          * and took the host's width with it, so it moved to the
                                          * tooltip. Left-to-right inside a column the interface may be
                                          * running right-to-left, the same treatment the account
                                          * switcher gives an address.
                                          */ }
                                        <Text
                                            variant='body'
                                            className='flex-1 truncate'>

                                            <span dir='ltr'>

                                                { getSiteHost(item.url) }

                                            </span>

                                        </Text>

                                    </Button>
                                ))
                            }

                        </div>
                    )
            }

            {
                notice.length > 0 &&
                (
                    <div className='mt-auto flex flex-col gap-1'>

                        <Text
                            className='text-txt-muted/70'
                            text={ T('Dashboard.Browser.Hint') } />

                        <Alert
                            dir='ltr'
                            variant='danger'
                            className='px-2 py-1 text-start font-mono'
                            text={ notice } />

                    </div>
                )
            }

        </div>
    );
}
