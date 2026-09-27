import TokenIcon from '../ui/token.icon';

import { useSiteIcon } from '../hook/image';

/**
 * A website's own icon, looked up from the site rather than assumed to sit at /favicon.ico, then
 * held by the image cache like any other. TokenIcon draws the lettered box while the lookup runs
 * and for a host that has no icon to give.
 */
export default function SiteIcon({ url, symbol, primary = false, size = 8 }: { url: string; symbol: string; primary?: boolean; size?: 5 | 8 | 9 }) {
    const icon = useSiteIcon(url);

    return <TokenIcon kind='unknown' src={icon} symbol={symbol} primary={primary} size={size} glyph='tiny' />;
}
