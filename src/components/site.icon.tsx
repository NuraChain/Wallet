import TokenIcon from './token.icon';

import { useSiteIcon } from '../hook/image';

/**
 * A website's own icon, looked up from the site rather than assumed to sit at /favicon.ico, then
 * held by the image cache like any other. TokenIcon draws the lettered box while the lookup runs
 * and for a host that has no icon to give.
 */
export default function SiteIcon({
    url,
    symbol,
    primary = false,
    className = 'size-8 text-tiny'
}: {
    url: string;
    symbol: string;
    primary?: boolean;
    className?: string;
}) {
    const icon = useSiteIcon(url);

    return <TokenIcon kind='unknown' src={icon} symbol={symbol} primary={primary} className={className} />;
}
