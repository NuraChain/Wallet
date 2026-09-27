/** The app shell: its languages, the floating mouse and the sidebar. */

import type { LucideIcon } from 'lucide-react';

export interface SidebarItem {
    key: string;
    label: string;
    icon: LucideIcon;
    active?: boolean;
    primary?: boolean;

    /** Marks the one action that erases the wallet, so the rail names it the same way the
        settings screen does rather than hiding it among the ordinary ones. */
    destructive?: boolean;
    onClick: () => void;
}

export type MouseAction = 'click' | 'double';

export type LanguageType = 'en' | 'fa' | 'ar' | 'es' | 'pt' | 'hi' | 'zh' | 'ru' | 'fr' | 'tr';
