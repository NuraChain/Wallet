import TokenIcon from '../ui/token.icon';

import { useSiteIcon } from '../hook/image';

export default function SiteIcon({ url, symbol, primary = false, size = 8 }: { url: string; symbol: string; primary?: boolean; size?: 5 | 8 | 9 }) {
    const icon = useSiteIcon(url);

    return <TokenIcon kind='unknown' src={icon} symbol={symbol} primary={primary} size={size} glyph='tiny' />;
}
